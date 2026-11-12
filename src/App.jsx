import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from './hooks/useToast.jsx'
import AdminApp from './pages/AdminApp.jsx'
import Participant from './pages/Participant.jsx'
import Signup from './pages/Signup.jsx'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        {/* Persoonlijke link uit de mail: geen aanmelding nodig, het token is de sleutel */}
        <Route path="/deelnemer/:token" element={<Participant />} />
        {/* Gedeelde inschrijflink voor alle leerkrachten */}
        <Route path="/inschrijven/:code" element={<Signup />} />
        <Route path="/*" element={<AdminApp />} />
      </Routes>
    </ToastProvider>
  )
}
