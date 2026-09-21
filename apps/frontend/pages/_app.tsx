import type { AppProps } from 'next/app'
import { ThemeSync } from '@/components/theme-sync'
import Head from 'next/head'
import Script from 'next/script'
import '../src/index.css'
import '../src/components/tv/tv.css'
export default function App({ Component, pageProps }: AppProps) {
  return <><ThemeSync /><Head><title>Wadi</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><link rel="icon" href="/favicon.svg" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" /><meta name="apple-mobile-web-app-capable" content="yes" /><meta name="mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-title" content="Wadi" /><meta name="apple-mobile-web-app-status-bar-style" content="default" /><meta name="theme-color" content="#16191f" /></Head><Component {...pageProps} /><Script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" strategy="afterInteractive" /></>
}
