import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// DELIBERATELY without <StrictMode> — double-mounting the Spline scene stutters
// the robot's cursor tracking (confirmed in the "rating speakers" prototype). Do not restore.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
