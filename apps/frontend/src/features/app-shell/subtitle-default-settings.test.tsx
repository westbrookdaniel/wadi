import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { SubtitleDefaultSettings } from './subtitle-default-settings'
import { useDeviceStore } from '@/store/device-store'
import { captionStyle } from '@/features/media/detail/player/caption-style'
import { initialLocalPlaybackState } from '@/features/media/detail/player/state'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ apiRequest: request, ApiError: Error }))
const legacy = { subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 2, subtitle_size: 0.9, subtitle_position: 0, subtitle_text_color: '#FFFFFF', subtitle_background_color: '#000000', subtitle_background_opacity: 0, subtitle_outline_color: '#000000', subtitle_outline_style: 'outline', subtitle_font_family: 'serif', subtitle_offset_x: 0, subtitle_offset_y: 0, playback_speed: 1.5, preferred_audio_language: 'jpn', preferred_audio_track_id: null }
afterEach(() => { localStorage.clear(); useDeviceStore.setState({ tvMode: false }); vi.clearAllMocks() })
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><SubtitleDefaultSettings /></QueryClientProvider>)
  return { ...view, close: () => { view.unmount(); client.clear() } }
}
it('imports legacy settings, previews exact caption styles and saves/reloads without changing other preferences', async () => {
  request.mockResolvedValue(legacy)
  const first = mount()
  const size = await screen.findByRole('spinbutton', { name: 'Default subtitle font scale' })
  expect(size).toHaveValue(0.9)
  expect(screen.getByRole('spinbutton', { name: 'Default subtitle outline weight' })).toHaveValue(1.5)
  fireEvent.change(size, { target: { value: '1.25' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Default subtitle outline weight' }), { target: { value: '3' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Default subtitle outline colour' }), { target: { value: '#ff0000' } })
  const actual = captionStyle({ ...initialLocalPlaybackState, subtitleSize: 1.25, subtitleOutlineWidth: 3, subtitleOutlineColor: '#ff0000', subtitleFontFamily: 'serif' })
  expect(screen.getByLabelText('Subtitle preview').style.textShadow).toBe(actual.textShadow)
  // Keyboard can reach and submit the standard save button.
  const user = userEvent.setup()
  screen.getByRole('button', { name: 'Save subtitle defaults' }).focus()
  await user.keyboard('{Enter}')
  await screen.findByText('Subtitle defaults saved on this device.')
  first.close()
  request.mockRejectedValue(new Error('offline'))
  const second = mount()
  expect(await screen.findByRole('spinbutton', { name: 'Default subtitle font scale' })).toHaveValue(1.25)
  expect(screen.getByRole('spinbutton', { name: 'Default subtitle outline weight' })).toHaveValue(3)
  expect(JSON.parse(localStorage.getItem('wadi.device.player.v1')!)).toMatchObject({ playback_speed: 1.5, subtitle_delay_seconds: 2, preferred_audio_language: 'jpn', subtitle_outline_color: '#ff0000' })
  second.close()
})
it('uses TV pickers and accepts border removal without leaving the settings panel', async () => {
  useDeviceStore.setState({ tvMode: true })
  request.mockResolvedValue(legacy)
  const view = mount()
  const border = await screen.findByRole('button', { name: /Default subtitle border style/ })
  fireEvent.click(border)
  const shadow = await screen.findByRole('button', { name: /Shadow/ })
  fireEvent.click(shadow)
  await waitFor(() => expect(screen.getByLabelText('Subtitle preview').style.textShadow).toContain('8px'))
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Default subtitle outline weight' }), { target: { value: '0' } })
  expect(screen.getByLabelText('Subtitle preview').style.textShadow).toBe('none')
  view.close()
})
