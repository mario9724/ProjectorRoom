import { useEffect, useState } from 'react'
import api from './services/api'
import './App.css'

function App() {
  const [status, setStatus] = useState('Conectando...')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAPI = async () => {
      try {
        const response = await api.get('/')
        setStatus('✅ API Conectada')
        console.log('Respuesta API:', response.data)
      } catch (error) {
        setStatus('❌ Error al conectar con API')
        console.error('Error:', error)
      } finally {
        setLoading(false)
      }
    }

    checkAPI()
  }, [])

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎬 ProjectorRoom</h1>
        <div className="status-card">
          <h2>Estado del Sistema</h2>
          <p className={loading ? 'loading' : 'ready'}>
            Backend: {status}
          </p>
          <p>Frontend: ✅ Activo</p>
        </div>
        <div className="info">
          <p>API URL: {import.meta.env.VITE_API_URL || 'localhost:10000'}</p>
        </div>
      </header>
    </div>
  )
}

export default App
