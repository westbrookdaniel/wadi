import { useQuery } from '@tanstack/react-query'
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny'

export type StreamMetadata = {
  mimeType: string
  duration: number
  video: Array<{
    codec: string | null
    width: number
    height: number
    canDecode: boolean
  }>
  audio: Array<{
    codec: string | null
    channels: number
    sampleRate: number
    language: string
    canDecode: boolean
  }>
}

export function useStreamMetadata(url?: string) {
  return useQuery({
    queryKey: ['stream-metadata', url],
    queryFn: async () => inspectStream(url!),
    enabled: Boolean(url),
    retry: false,
    staleTime: 1000 * 60 * 10,
  })
}

async function inspectStream(url: string): Promise<StreamMetadata> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(url),
  })

  try {
    const [mimeType, duration, videoTracks, audioTracks] = await Promise.all([
      input.getMimeType(),
      input.computeDuration(),
      input.getVideoTracks(),
      input.getAudioTracks(),
    ])

    const [video, audio] = await Promise.all([
      Promise.all(
        videoTracks.map(async (track) => ({
          codec: await track.getCodecParameterString(),
          width: track.displayWidth,
          height: track.displayHeight,
          canDecode: await track.canDecode(),
        })),
      ),
      Promise.all(
        audioTracks.map(async (track) => ({
          codec: await track.getCodecParameterString(),
          channels: track.numberOfChannels,
          sampleRate: track.sampleRate,
          language: track.languageCode,
          canDecode: await track.canDecode(),
        })),
      ),
    ])

    return { mimeType, duration, video, audio }
  } finally {
    input.dispose()
  }
}
