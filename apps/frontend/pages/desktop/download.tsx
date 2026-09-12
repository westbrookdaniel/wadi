export default function Download() {
  const base = process.env.NEXT_PUBLIC_DESKTOP_RELEASES_URL
  return <main className="grid min-h-screen place-content-center gap-5 p-8"><h1 className="text-3xl">Wadi for desktop</h1><p>Local streaming conversion, audio compatibility and your synced library.</p>{base ? <a className="underline" href={base}>Download for Windows, macOS or Linux</a> : <p>Desktop installers have not been published yet. You can continue using the web player.</p>}<a className="underline" href="/home">Continue on the web</a></main>
}
