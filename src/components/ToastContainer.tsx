import React from 'react';
import { useStore } from '../store/store';

/**
 * 全局 Toast 通知容器组件
 * 从全局 store 中读取通知并渲染，可手动关闭
 */
const ToastContainer: React.FC = () => {
  const notifications = useStore((s) => s.notifications);
  const removeNotification = useStore((s) => s.removeNotification);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
      {notifications.map(n => (
        <div key={n.id} className={`min-w-55 max-w-sm px-4 py-3 rounded-lg shadow-lg border ${n.type === 'success' ? 'bg-white border-green-100' : n.type === 'error' ? 'bg-white border-red-100' : 'bg-white border-slate-100'}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-800">{n.message}</div>
            </div>
            <button onClick={() => removeNotification(n.id)} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
