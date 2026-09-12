import Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { z } from 'zod'
import { desktopBridge } from '@/lib/desktop'
import { initialPlayerState, type PlayerState } from './state'
const sessionSchema = z.object({ id:z.string(),url:z.url(),duration:z.number(),offset:z.number(),hasVideo:z.boolean(),hasAudio:z.boolean(),audioTracks:z.array(z.object({id:z.string(),label:z.string(),language:z.string()})),selectedAudioTrackId:z.string().nullable(),mode:z.enum(['direct','remux','audio','video']) })
const hintsSchema = z.object({ proxyHeaders: z.object({ request:z.record(z.string(),z.string()).optional() }).optional() })
export function useDesktopPlayer({ videoRef, source, hints, savedPosition, watched, onProgressCommit }: {
  videoRef:RefObject<HTMLVideoElement | null>; source?:string; hints:unknown; savedPosition:number; watched:boolean; onProgressCommit:(position:number,duration:number)=>void
}) {
  const [state,setState]=useState<PlayerState>(initialPlayerState)
  const stateRef=useRef(state)
  const position=useRef(watched?0:savedPosition)
  const restore=useRef(watched?0:savedPosition)
  const started=useRef(false)
  useEffect(()=>{restore.current=watched?0:savedPosition},[watched,savedPosition])
  const audio=useRef<string|null>(null)
  const speed=useRef(1)
  const forceVideo=useRef(false)
  const playing=useRef(true)
  const job=useRef<string|null>(null)
  const commit=useRef(onProgressCommit)
  const [generation,restart]=useState(0)
  const parsed=hintsSchema.safeParse(hints)
  const headers=JSON.stringify(parsed.success?parsed.data.proxyHeaders?.request??{}:{})
  useEffect(()=>{commit.current=onProgressCommit},[onProgressCommit])
  const update=useCallback((patch:Partial<PlayerState>)=>{stateRef.current={...stateRef.current,...patch};setState(stateRef.current)},[])
  useEffect(()=>{
    const desktop=desktopBridge(),video=videoRef.current
    if(!desktop||!source||!video||!playing.current)return
    if(!started.current){position.current=restore.current;started.current=true}
    let cancelled=false,hls:Hls|null=null
    const id=crypto.randomUUID()
    let heartbeat:ReturnType<typeof setInterval>|undefined
    const launchPosition=position.current
    let playable=false
    let offset=position.current,duration=0,lastCommit=0
    update({status:'loading',error:null,playing:false,currentTime:position.current})
    const sync=()=>{
      if(!playable)return
      position.current=offset+video.currentTime
      update({currentTime:position.current,playing:!video.paused,volume:video.volume,muted:video.muted})
      if(Date.now()-lastCommit>10000){lastCommit=Date.now();commit.current(position.current,duration)}
    }
    const failed=()=>{if(!cancelled)update({status:'error',error:'Playback failed. Retry with full conversion or choose another stream.'})}
    video.addEventListener('error',failed)
    const ended=()=>{playing.current=false;update({playing:false});commit.current(position.current,duration)}
    video.addEventListener('timeupdate',sync);video.addEventListener('volumechange',sync);video.addEventListener('ended',ended)
    void desktop.media('start',{id,url:source,headers:JSON.parse(headers),position:position.current,audio:audio.current,speed:speed.current,forceVideo:forceVideo.current}).then(async value=>{
      const result=sessionSchema.parse(value)
      if(cancelled){await desktop.media('stop',id);return}
      job.current=id;offset=result.offset;duration=result.duration
      audio.current=result.selectedAudioTrackId
      update({duration,hasVideo:result.hasVideo,hasAudio:result.hasAudio,audioTracks:result.audioTracks,selectedAudioTrackId:result.selectedAudioTrackId,warning:result.mode==='audio'?'Converting audio locally':result.mode==='video'?'Converting video locally':null})
      video.volume=stateRef.current.volume;video.muted=stateRef.current.muted;video.playbackRate=speed.current
      if (result.mode === 'direct') {
        video.src=result.url
        video.onloadedmetadata=()=>{video.currentTime=launchPosition;playable=true;update({status:'ready'});void video.play().catch(()=>update({playing:false}))}
      } else {
      hls=new Hls({startPosition:0,liveSyncDurationCount:1,liveMaxLatencyDurationCount:Infinity,maxBufferLength:20,backBufferLength:20,enableWorker:true})
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{playable=true;update({status:'ready'});void video.play().catch(()=>{update({playing:false});})})
      hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal){update({status:'error',error:'This stream could not play. Retry with full conversion or choose another stream.'});}})
      hls.loadSource(result.url);hls.attachMedia(video)
      }
      heartbeat=setInterval(()=>{
        if(id)void desktop.media('status',id).then(value=>{
          const result=z.object({error:z.string().nullable()}).parse(value)
          if(result.error&&!cancelled)update({status:'error',error:result.error,playing:false})
        }).catch(()=>{if(!cancelled)update({status:'error',error:'Local media service disconnected'})})
      },10000)
    }).catch(error=>{if(!cancelled)update({status:'error',error:error instanceof Error?error.message:'Could not open stream'})})
    return ()=>{
      cancelled=true;playable=false;video.removeEventListener('error',failed);clearInterval(heartbeat);hls?.destroy();video.onloadedmetadata=null;video.pause();video.removeAttribute('src');video.load()
      video.removeEventListener('timeupdate',sync);video.removeEventListener('volumechange',sync);video.removeEventListener('ended',ended)
      if(id){void desktop.media('stop',id).catch(()=>{});if(job.current===id)job.current=null}
      if(duration)commit.current(position.current,duration)
    }
  },[source,headers,generation,videoRef,update])
  const pause=useCallback((_commit=false)=>{playing.current=false;videoRef.current?.pause();update({playing:false});commit.current(position.current,stateRef.current.duration);restart(n=>n+1)},[videoRef,update])
  const play=useCallback(async()=>{if(playing.current&&videoRef.current?.paused&&job.current){await videoRef.current.play();return}playing.current=true;restart(n=>n+1)},[videoRef])
  const seek=useCallback(async(seconds:number,_commit=false)=>{position.current=Math.max(0,Math.min(seconds,stateRef.current.duration||seconds));update({currentTime:position.current});commit.current(position.current,stateRef.current.duration);restart(n=>n+1)},[update])
  const setAudioTrack=useCallback((id:string|null)=>{if(id&&id!==audio.current){audio.current=id;restart(n=>n+1)}},[])
  const setPlaybackSpeed=useCallback((value:number)=>{if(value!==speed.current){speed.current=value;update({playbackSpeed:value});restart(n=>n+1)}},[update])
  const setVolume=useCallback((value:number)=>{const volume=Math.min(1,Math.max(0,value));if(videoRef.current)videoRef.current.volume=volume;update({volume})},[videoRef,update])
  const toggleMute=useCallback(()=>{const muted=!stateRef.current.muted;if(videoRef.current)videoRef.current.muted=muted;update({muted})},[videoRef,update])
  const toggle=useCallback(()=>{if(stateRef.current.playing)pause(true);else void play()},[pause,play])
  const retry=useCallback(()=>{forceVideo.current=true;playing.current=true;restart(n=>n+1)},[])
  return {state,play,pause,seek,setVolume,setAudioTrack,setPlaybackSpeed,toggleMute,toggle,retry}
}
