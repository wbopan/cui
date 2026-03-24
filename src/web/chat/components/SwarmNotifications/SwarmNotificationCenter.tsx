import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertCircle, Info, Users, Brain, Zap } from 'lucide-react';

export type SwarmNotificationType =
  | 'agent_spawn'
  | 'agent_complete'
  | 'swarm_init'
  | 'swarm_complete'
  | 'task_orchestrate'
  | 'error'
  | 'milestone'
  | 'approval_needed';

export interface SwarmNotification {
  id: string;
  type: SwarmNotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  severity: 'info' | 'success' | 'warning' | 'error';
  agentId?: string;
  agentName?: string;
  actionUrl?: string;
}

interface SwarmNotificationCenterProps {
  notifications: SwarmNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

export function SwarmNotificationCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onDismissAll,
}: SwarmNotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const getNotificationIcon = (type: SwarmNotificationType) => {
    switch (type) {
      case 'swarm_init':
      case 'swarm_complete':
        return <Users size={16} className="text-blue-500" />;
      case 'agent_spawn':
      case 'agent_complete':
        return <Brain size={16} className="text-purple-500" />;
      case 'task_orchestrate':
        return <Zap size={16} className="text-yellow-500" />;
      case 'error':
        return <AlertCircle size={16} className="text-red-500" />;
      case 'milestone':
      case 'approval_needed':
        return <CheckCircle size={16} className="text-green-500" />;
      default:
        return <Info size={16} className="text-gray-500" />;
    }
  };

  const getSeverityBorder = (severity: SwarmNotification['severity']) => {
    switch (severity) {
      case 'success': return 'border-l-4 border-l-green-500';
      case 'warning': return 'border-l-4 border-l-yellow-500';
      case 'error': return 'border-l-4 border-l-red-500';
      default: return 'border-l-4 border-l-blue-500';
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 max-h-[600px] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">Notifications</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                    filter === 'all'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                    filter === 'unread'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {/* Actions */}
              {notifications.length > 0 && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={onMarkAllAsRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Mark all as read
                  </button>
                  <button
                    onClick={onDismissAll}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Dismiss all
                  </button>
                </div>
              )}
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto flex-1">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-zinc-700">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors ${
                        !notification.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                      } ${getSeverityBorder(notification.severity)}`}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-medium text-sm">
                              {notification.title}
                            </h4>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatTimestamp(notification.timestamp)}
                            </span>
                          </div>

                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>

                          {notification.agentName && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              Agent: {notification.agentName}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 mt-2">
                            {!notification.read && (
                              <button
                                onClick={() => onMarkAsRead(notification.id)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Mark as read
                              </button>
                            )}
                            <button
                              onClick={() => onDismiss(notification.id)}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Hook to manage notifications
export function useSwarmNotifications() {
  const [notifications, setNotifications] = useState<SwarmNotification[]>([]);

  const addNotification = (notification: Omit<SwarmNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: SwarmNotification = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const dismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const dismissAll = () => {
    setNotifications([]);
  };

  return {
    notifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    dismiss,
    dismissAll,
  };
}
