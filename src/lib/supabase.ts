import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// "Recordar sesión" (login): false => la sesión vive solo en la pestaña.
const recordarSesion = localStorage.getItem('recordar-sesion') !== 'false'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: recordarSesion ? {} : { storage: sessionStorage },
})
