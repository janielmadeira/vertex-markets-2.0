import type { Metadata } from 'next'
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
