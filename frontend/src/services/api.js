import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000'

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Interceptor para logging
api.interceptors.request.use(
  (config) => {
    console.log('📤 Request:', config.method.toUpperCase(), config.url)
    return config
  },
  (error) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    console.log('📥 Response:', response.status, response.data)
    return response
  },
  (error) => {
    console.error('❌ Response Error:', error.message)
    return Promise.reject(error)
  }
)

export default api
