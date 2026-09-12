import { desktopBridge } from '@/lib/desktop'
import type { PlaybackPreferences } from '@/api/types'
// Preset identities/platforms follow Stremio Web's EXTERNAL_PLAYERS list.
// Link formats are implemented from Stremio core's deep-link protocol examples.
export const externalPlayers = [
  {id:'choose',label:'Choose an app',platforms:'Android'},
  {id:'vlc',label:'VLC',platforms:'iOS, visionOS, Android, Windows'},
  {id:'mpv',label:'MPV',platforms:'macOS'},
  {id:'iina',label:'IINA',platforms:'macOS'},
  {id:'mxplayer',label:'MX Player',platforms:'Android'},
  {id:'justplayer',label:'Just Player',platforms:'Android'},
  {id:'outplayer',label:'Outplayer',platforms:'iOS, visionOS'},
  {id:'moonplayer',label:'Moonplayer',platforms:'visionOS'},
  {id:'cineultra',label:'CineUltra',platforms:'visionOS'},
  {id:'infuse',label:'Infuse',platforms:'iOS, visionOS, macOS'},
  {id:'vidhub',label:'VidHub',platforms:'iOS'},
  {id:'m3u',label:'M3U playlist',platforms:'Download for any compatible player'},
  {id:'custom',label:'Custom',platforms:'Use your own URL template'},
]
export function validCustomTemplate(value:string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) && value.includes('{url}') && !/^(javascript|data|vbscript|file|shell|powershell|cmd|ms-settings):/i.test(value)
}
export function externalPlayerLink(source:string,preferences:PlaybackPreferences) {
  const preset=preferences.external_player_preset??'custom'
  const encoded=encodeURIComponent(source)
  if(preset==='custom')return validCustomTemplate(preferences.external_player_template)?preferences.external_player_template.replaceAll('{url}',encoded):null
  if(preset==='m3u')return null
  const url=new URL(source)
  if(!['http:','https:'].includes(url.protocol))return null
  const intent=(packageName?:string)=>`intent://${source.replace(/^https?:\/\//,'').replaceAll('#','%23')}#Intent;${packageName?`package=${packageName};`:''}type=video/*;scheme=${url.protocol.slice(0,-1)};end`
  switch(preset){
    case 'choose':return intent()
    case 'vlc':return /Android/i.test(navigator.userAgent)?intent('org.videolan.vlc'):/iPhone|iPad|iPod|Vision/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?`vlc-x-callback://x-callback-url/stream?url=${encoded}`:`vlc://${source}`
    case 'mxplayer':return intent('com.mxtech.videoplayer.ad')
    case 'justplayer':return intent('com.brouken.player')
    case 'mpv':return `mpv://${source}`
    case 'iina':return `iina://weblink?url=${encoded}`
    case 'outplayer':return source.replace(/^https?:\/\//,'outplayer://')
    case 'moonplayer':return `moonplayer://open?url=${source}`
    case 'cineultra':return `cineultra://playback?url=${encoded}`
    case 'infuse':return `infuse://x-callback-url/play?url=${encoded}`
    case 'vidhub':return `open-vidhub://x-callback-url/open?url=${encoded}`
    default:return null
  }
}
export async function openExternalPlayback(source:string,preferences:PlaybackPreferences) {
  if(preferences.external_player_preset==='m3u'){
    if(/[\r\n]/.test(source)||!/^https?:\/\//i.test(source))throw new Error('A playlist needs a direct HTTP stream')
    const url=URL.createObjectURL(new Blob([`#EXTM3U\n${source}\n`],{type:'audio/x-mpegurl'}))
    const link=document.createElement('a');link.href=url;link.download='wadi-stream.m3u';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return
  }
  const url=externalPlayerLink(source,preferences)
  if(!url)throw new Error('Choose another player or update your custom template in Settings')
  const desktop=desktopBridge()
  if(desktop)await desktop.openExternal(url);else window.location.assign(url)
}
