import type { AppProps } from 'next/app'
import Head from 'next/head'
import Script from 'next/script'
import '../src/index.css'
export default function App({ Component, pageProps }: AppProps) {
  return <><Head><title>Wadi</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><link rel="icon" href="/favicon.svg" /></Head><Component {...pageProps} /><Script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" strategy="afterInteractive" /></>
}
