import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import type { Role } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Shops from './pages/customer/Shops'
import ShopDetail from './pages/customer/ShopDetail'
import Checkout from './pages/customer/Checkout'
import Orders from './pages/customer/Orders'
import OrderDetail from './pages/customer/OrderDetail'
import PartnerHome from './pages/partner/PartnerHome'
import ShopDashboard from './pages/shop/ShopDashboard'
import AdminHome from './pages/admin/AdminHome'
import Account from './pages/Account'

const HOME: Record<Role, string> = { customer: '/', partner: '/partner', shop: '/shop', admin: '/admin' }

function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { profile } = useAuth()
  if (!profile) return null
  return roles.includes(profile.role) ? <>{children}</> : <Navigate to={HOME[profile.role]} replace />
}

function Routed() {
  const { session, profile, ready, error, signOut } = useAuth()
  if (!ready) return <p className="muted center">Loading…</p>
  if (!session) return <Login />
  if (!profile) return (
    <main className="page"><p className="error">Could not load your account{error ? `: ${error}` : ''}.</p><button onClick={signOut}>Sign out</button></main>
  )
  const customer: Role[] = ['customer', 'admin']
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Guard roles={customer}><Shops /></Guard>} />
        <Route path="/shop/:shopId" element={<Guard roles={customer}><ShopDetail /></Guard>} />
        <Route path="/checkout" element={<Guard roles={customer}><Checkout /></Guard>} />
        <Route path="/orders" element={<Guard roles={customer}><Orders /></Guard>} />
        <Route path="/orders/:orderId" element={<OrderDetail />} />
        <Route path="/account" element={<Account />} />
        <Route path="/partner" element={<Guard roles={['partner', 'admin']}><PartnerHome /></Guard>} />
        <Route path="/shop" element={<Guard roles={['shop', 'admin']}><ShopDashboard /></Guard>} />
        <Route path="/admin" element={<Guard roles={['admin']}><AdminHome /></Guard>} />
        <Route path="*" element={<Navigate to={HOME[profile.role]} replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><BrowserRouter><Routed /></BrowserRouter></AuthProvider>
}
