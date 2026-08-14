import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// CELOWO bez <StrictMode> — podwójny montaż sceny Spline zacina śledzenie
// kursora przez robota (sprawdzone w prototypie „rating speakers"). Nie przywracać.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
