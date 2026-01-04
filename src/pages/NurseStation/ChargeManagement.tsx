import React, { useState, useEffect, useCallback } from 'react';
import { Search, CreditCard, FileText, CheckCircle, XCircle } from 'lucide-react';
import { chargeApi, logApiError } from '../../services/api';
import type { ChargeVO } from '../../types';

const ChargeManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [charges, setCharges] = useState<ChargeVO[]>([]);
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all'); // 0: Unpaid, 1: Paid, 2: Refunded
  const [keyword, setKeyword] = useState('');
  const [selectedCharge, setSelectedCharge] = useState<ChargeVO | null>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(1); // 1: Cash, 3: WeChat, 4: Alipay

  const loadCharges = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      // 简单的关键字搜索，假设后端支持 chargeNo 或 patientName 搜索，或者这里只传 keyword 让后端处理
      // 根据文档，参数是 chargeNo, patientId, status, startDate, endDate
      // 这里我们假设 keyword 是 chargeNo
      if (keyword) params.chargeNo = keyword;
      
      const pageData = await chargeApi.getList(params);
      if (pageData && pageData.content) {
        setCharges(pageData.content);
      } else {
        setCharges([]);
      }
    } catch (err) {
      logApiError('ChargeManagement.loadCharges', err);
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, keyword]);

  useEffect(() => {
    loadCharges();
  }, [loadCharges]);

  const openPaymentModal = (charge: ChargeVO) => {
    setSelectedCharge(charge);
    setPaymentMethod(1);
    setShowPaymentModal(true);
  };

  const handleConfirmPay = async () => {
    if (!selectedCharge) return;
    
    try {
      // 生成模拟交易流水号（非现金支付需要）
      const generateTransactionNo = (paymentMethod: number): string | undefined => {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        switch (paymentMethod) {
          case 1: // 现金，不需要交易号
            return undefined;
          case 2: // 银行卡
            return `BC${timestamp}${random}`;
          case 3: // 微信
            return `WX${timestamp}${random}`;
          case 4: // 支付宝
            return `ALI${timestamp}${random}`;
          case 5: // 医保
            return `YB${timestamp}${random}`;
          default:
            return `TX${timestamp}${random}`;
        }
      };

      const transactionNo = generateTransactionNo(paymentMethod);
      const success = await chargeApi.pay(selectedCharge.id, { 
        paymentMethod, 
        paidAmount: selectedCharge.totalAmount,
        transactionNo
      });
      
      if (success) {
        alert('缴费成功');
        setShowPaymentModal(false);
        loadCharges();
        setSelectedCharge(null);
      } else {
        alert('缴费失败');
      }
    } catch {
      alert('缴费出错');
    }
  };

  const handleRefund = async (id: number) => {
    const reason = prompt('请输入退费原因：');
    if (!reason) return;
    try {
      const success = await chargeApi.refund(id, { refundReason: reason });
      if (success) {
        alert('退费成功');
        loadCharges();
        setSelectedCharge(null);
      } else {
        alert('退费失败');
      }
    } catch {
      alert('退费出错');
    }
  };

  return (
    <div className="flex h-full bg-slate-50 relative">
      {/* 左侧列表 */}
      <div className="w-1/3 border-r bg-white flex flex-col">
        <div className="p-4 border-b space-y-3">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            <CreditCard className="text-blue-600" size={20}/> 收费管理
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="搜索收费单号..." 
              className="w-full pl-9 p-2 bg-slate-50 border rounded-lg text-sm outline-none focus:border-blue-500"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadCharges()}
            />
          </div>
          <div className="flex gap-2">
            {[
              { label: '全部', val: 'all' },
              { label: '待缴费', val: 0 },
              { label: '已缴费', val: 1 },
              { label: '已退费', val: 2 }
            ].map(opt => (
              <button
                key={opt.label}
                onClick={() => setStatusFilter(opt.val as number | 'all')}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  statusFilter === opt.val 
                    ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">加载中...</div>
          ) : charges.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">暂无记录</div>
          ) : (
            charges.map(c => (
              <div 
                key={c.id}
                onClick={() => setSelectedCharge(c)}
                className={`p-4 border-b cursor-pointer hover:bg-slate-50 transition-colors ${selectedCharge?.id === c.id ? 'bg-blue-50/50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-slate-700">{c.patientName}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    c.status === 1 ? 'bg-green-100 text-green-700' : 
                    c.status === 2 ? 'bg-slate-100 text-slate-500' : 
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {c.statusDesc}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span className="font-mono">{c.chargeNo}</span>
                  <span className="font-bold text-slate-700">¥{c.totalAmount.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{c.createdAt || c.createTime}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 bg-slate-50 p-6 flex flex-col">
        {selectedCharge ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b bg-slate-50/30 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800">收费单详情</h3>
                <p className="text-sm text-slate-500 mt-1">单号：{selectedCharge.chargeNo}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">¥{selectedCharge.totalAmount.toFixed(2)}</div>
                <div className="text-xs text-slate-500">总金额</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                  <tr>
                    <th className="px-4 py-3">项目名称</th>
                    <th className="px-4 py-3">类型</th>
                    <th className="px-4 py-3 text-right">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedCharge.details || selectedCharge.items || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{item.itemName || item.name}</td>
                      <td className="px-4 py-3 text-slate-500">{item.itemType || item.type}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700">¥{item.itemAmount || item.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t bg-slate-50 flex justify-end gap-3">
              {selectedCharge.status === 0 && (
                <button 
                  onClick={() => openPaymentModal(selectedCharge)}
                  className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                >
                  <CheckCircle size={18}/> 确认收费
                </button>
              )}
              {selectedCharge.status === 1 && (
                <button 
                  onClick={() => handleRefund(selectedCharge.id)}
                  className="px-6 py-2 bg-red-50 text-red-600 font-bold rounded-lg border border-red-200 hover:bg-red-100 transition-all flex items-center gap-2"
                >
                  <XCircle size={18}/> 申请退费
                </button>
              )}
              <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50">
                打印票据
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <FileText size={48} className="mb-4 opacity-20"/>
            <p>请选择左侧收费单查看详情</p>
          </div>
        )}
      </div>

      {/* 支付弹窗 */}
      {showPaymentModal && selectedCharge && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-96 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">收银台</h3>
            
            <div className="bg-slate-50 p-4 rounded-lg mb-6 text-center">
              <div className="text-sm text-slate-500 mb-1">应收金额</div>
              <div className="text-3xl font-bold text-blue-600">¥{selectedCharge.totalAmount.toFixed(2)}</div>
            </div>

            <div className="space-y-3 mb-6">
              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${paymentMethod === 1 ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                <input type="radio" name="pay" checked={paymentMethod === 1} onChange={() => setPaymentMethod(1)} className="accent-blue-600"/>
                <span className="font-medium text-slate-700">现金支付</span>
              </label>
              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${paymentMethod === 3 ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300'}`}>
                <input type="radio" name="pay" checked={paymentMethod === 3} onChange={() => setPaymentMethod(3)} className="accent-green-600"/>
                <span className="font-medium text-slate-700">微信支付</span>
              </label>
              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${paymentMethod === 4 ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                <input type="radio" name="pay" checked={paymentMethod === 4} onChange={() => setPaymentMethod(4)} className="accent-blue-600"/>
                <span className="font-medium text-slate-700">支付宝</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
              >
                取消
              </button>
              <button 
                onClick={handleConfirmPay}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-200"
              >
                确认收款
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChargeManagement;
