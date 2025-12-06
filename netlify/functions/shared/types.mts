// User role types for role-based access control
export type UserRole = 'cliente' | 'administrador' | 'supervisor' | 'entregador';

// Order status types
export type OrderStatus = 'pendente' | 'em_preparacao' | 'em_entrega' | 'entregue' | 'pago' | 'cancelado';
export type PaymentStatus = 'aguardando_pagamento' | 'pago' | 'confirmado';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  city: string;
  postalCode: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  paymentConfirmedByCustomer?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  verified: boolean;
  role: UserRole;
  createdAt: string;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
}

export interface OTPData {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

// Role permissions
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  cliente: [
    'view_products',
    'add_to_cart',
    'checkout',
    'view_own_orders',
    'manage_own_profile',
  ],
  entregador: [
    'view_assigned_deliveries',
    'update_delivery_status',
    'view_own_profile',
    'manage_own_profile',
  ],
  supervisor: [
    'view_products',
    'view_all_orders',
    'manage_orders',
    'assign_deliveries',
    'view_users',
    'view_own_profile',
    'manage_own_profile',
  ],
  administrador: [
    'view_products',
    'manage_products',
    'view_all_orders',
    'manage_orders',
    'assign_deliveries',
    'view_users',
    'manage_users',
    'manage_roles',
    'view_analytics',
    'manage_own_profile',
  ],
};

// Check if a role has a specific permission
export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Check if a role can access admin features
export function isAdminRole(role: UserRole): boolean {
  return role === 'administrador';
}

// Check if a role can manage orders
export function canManageOrders(role: UserRole): boolean {
  return role === 'administrador' || role === 'supervisor';
}

// Check if a role can manage deliveries
export function isDeliveryRole(role: UserRole): boolean {
  return role === 'entregador';
}

// Role display names in Portuguese
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  cliente: 'Cliente',
  administrador: 'Administrador',
  supervisor: 'Supervisor',
  entregador: 'Entregador',
};

// Get all available roles
export function getAllRoles(): UserRole[] {
  return ['cliente', 'administrador', 'supervisor', 'entregador'];
}
