import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Vertex Markets',
  description: 'Plataforma de negociação de opções digitais',
}

// Bloqueia pinch-to-zoom da página inteira para o chart capturar o gesto.
// Trading apps tipicamente desativam zoom da página — usuário pincha no gráfico.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className={`${inter.className} h-full overflow-hidden`}>
        <AuthProvider>
          <Suspense fallback={null}><ImpersonationBanner /></Suspense>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
