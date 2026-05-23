'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Loader2 } from 'lucide-react'

const ADMIN_EMAIL = 'janielmadeira@gmail.com'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const user    = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)

  useEffect(() => {
    if (!loading && (!user || user.email !== ADMIN_EMAIL)) {
      router.replace('/')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="animate-spin text-green-400" size={32} />
      </div>
    )
  }

  if (!user || user.email !== ADMIN_EMAIL) return null

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
