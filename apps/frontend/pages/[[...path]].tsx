import dynamic from 'next/dynamic'
const Wadi = dynamic(() => import('../src/wadi-app'), { ssr: false })
export default function Page() { return <Wadi /> }
