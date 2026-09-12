import { createRoot } from 'react-dom/client'
import WadiApp from '../../frontend/src/wadi-app'
import '../../frontend/src/index.css'
import { useAppStore } from '../../frontend/src/store/app-store'
const connected = await window.wadiDesktop?.session()
if (connected) useAppStore.getState().setToken('desktop-session')
const root = document.getElementById('root')
if (!root) throw new Error('Missing app root')
createRoot(root).render(<WadiApp />)
