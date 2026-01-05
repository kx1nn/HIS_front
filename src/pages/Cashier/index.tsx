import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, CreditCard, FileText, CheckCircle, XCircle, 
  DollarSign, Receipt, LogOut, User, Plus,
  Activity, ClipboardList
} from 'lucide-react';
import { chargeApi, registrationApi, logApiError } from '../../services/api';
import { useStore } from '../../store/store';
import type { ChargeVO, RegistrationVO, ChargeDetailVO, RegistrationStatusValue } from '../../types';
import { RegistrationStatus } from '../../types';

/**
 * 收费工作站
 * 功能：三种开单模式、支付确认、退费、日报表
 */

// 格式化货币
const formatCurrency = (v?: string | number | null) => {
  if (v == null) return '0.00';
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  if (!isFinite(n)) return '0.00';
  return n.toFixed(2);
};

// 挂号状态标签
const registrationStatusLabels: Record<RegistrationStatusValue, string> = {
  [RegistrationStatus.WAITING]: '待就诊',
  [RegistrationStatus.COMPLETED]: '已就诊',
  [RegistrationStatus.CANCELLED]: '已取消',
  [RegistrationStatus.REFUNDED]: '已退费',
  [RegistrationStatus.PAID_REGISTRATION]: '已缴挂号费',
  [RegistrationStatus.IN_CONSULTATION]: '就诊中'
};

// 支付方式映射
const paymentMethods = [
  { value: 1, label: '现金', colorClass: 'border-green-500 bg-green-50', icon: '💵' },
  { value: 2, label: '银行卡', colorClass: 'border-blue-500 bg-blue-50', icon: '💳' },
  { value: 3, label: '微信', colorClass: 'border-green-500 bg-green-50', icon: '💚' },
  { value: 4, label: '支付宝', colorClass: 'border-blue-500 bg-blue-50', icon: '🔵' },
  { value: 5, label: '医保', colorClass: 'border-red-500 bg-red-50', icon: '🏥' }
];

const Cashier: React.FC = () => {
  const { user, logout, notify } = useStore();
  const navigate = useNavigate();

  // 主界面状态
  const [activeTab, setActiveTab] = useState<'charges' | 'registrations'>('charges');
  const [charges, setCharges] = useState<ChargeVO[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedCharge, setSelectedCharge] = useState<ChargeVO | null>(null);
  const [statusFilter, setStatusFilter] = useState<RegistrationStatusValue | 'all'>('all');

  // 支付弹窗状态
  const [paymentModal, setPaymentModal] = useState<{
    visible: boolean;
    charge: ChargeVO | null;
  }>({ visible: false, charge: null });
  const [paymentMethod, setPaymentMethod] = useState(1);

  // 开单弹窗状态
  const [createChargeModal, setCreateChargeModal] = useState<{
    visible: boolean;
    mode: 'registration' | 'prescription' | 'combined' | null;
    registrationId?: number;
    prescriptionIds?: number[];
  }>({ visible: false, mode: null });

  // 加载收费单列表
  const loadCharges = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (keyword) params.chargeNo = keyword;

      const pageData = await chargeApi.getList(params);
      if (pageData?.content) {
        setCharges(pageData.content);
      } else {
        setCharges([]);
      }
    } catch (err) {
      logApiError('Cashier.loadCharges', err);
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, keyword]);

  // 加载挂号列表（用于开单）
  const loadRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const params = keyword ? { keyword } : undefined;
      const list = await registrationApi.getList(params);
      setRegistrations(list || []);
    } catch (err) {
      logApiError('Cashier.loadRegistrations', err);
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    if (activeTab === 'charges') {
      loadCharges();
    } else {
      loadRegistrations();
    }
  }, [activeTab, loadCharges, loadRegistrations]);

  // 打开开单弹窗
  const openCreateChargeModal = (mode: 'registration' | 'prescription' | 'combined', registrationId?: number) => {
    setCreateChargeModal({ visible: true, mode, registrationId });
  };

  // 创建收费单
  const handleCreateCharge = async () => {
    const { mode, registrationId } = createChargeModal;
    if (!registrationId) {
      notify('请选择挂号单', 'error');
      return;
    }

    try {
      let charge: ChargeVO | null = null;

      if (mode === 'registration') {
        // 仅收挂号费
        charge = await chargeApi.createRegistrationCharge(registrationId);
      } else if (mode === 'prescription') {
        // 仅收处方费（需要处方ID，这里简化处理）
        charge = await chargeApi.createPrescriptionCharge({ registrationId });
      } else if (mode === 'combined') {
        // 普通开单（合并收费）
        charge = await chargeApi.create({ registrationId });
      }

      if (charge) {
        notify('收费单创建成功', 'success');
        setCreateChargeModal({ visible: false, mode: null });
        setSelectedCharge(charge);
        loadCharges();
      } else {
        notify('创建收费单失败', 'error');
      }
    } catch (err) {
      logApiError('Cashier.handleCreateCharge', err);
      notify('创建收费单出错', 'error');
    }
  };

  // 打开支付弹窗
  const openPaymentModal = (charge: ChargeVO) => {
    setPaymentModal({ visible: true, charge });
    setPaymentMethod(1);
  };

  // 生成支付流水号
  const generateTransactionNo = (method: number): string | undefined => {
    if (method === 1) return undefined; // 现金不需要流水号
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const prefix = { 2: 'BC', 3: 'WX', 4: 'ALI', 5: 'YB' }[method] || 'TX';
    return `${prefix}${timestamp}${random}`;
  };

  // 模拟支付（3秒后自动成功）
  const simulatePayment = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      notify('正在处理支付...', 'info');
      setTimeout(() => {
        resolve(true);
      }, 3000);
    });
  };

  // 确认支付
  const handleConfirmPayment = async () => {
    const { charge } = paymentModal;
    if (!charge) return;

    try {
      // 模拟支付过程
      const paymentSuccess = await simulatePayment();
      
      if (!paymentSuccess) {
        notify('支付失败，请重试', 'error');
        return;
      }

      // 调用支付接口
      const transactionNo = generateTransactionNo(paymentMethod);
      const paidCharge = await chargeApi.pay(charge.id, {
        paymentMethod,
        paidAmount: charge.totalAmount,
        transactionNo
      });

      if (paidCharge) {
        notify('支付成功！', 'success');
        setPaymentModal({ visible: false, charge: null });
        setSelectedCharge(paidCharge);
        loadCharges();
      } else {
        notify('支付失败', 'error');
      }
    } catch (err) {
      logApiError('Cashier.handleConfirmPayment', err);
      notify('支付出错', 'error');
    }
  };

  // 退费
  const handleRefund = async (id: number) => {
    const reason = prompt('请输入退费原因：');
    if (!reason) return;

    try {
      const refundedCharge = await chargeApi.refund(id, { refundReason: reason });
      if (refundedCharge) {
        notify('退费成功', 'success');
        setSelectedCharge(refundedCharge);
        loadCharges();
      } else {
        notify('退费失败', 'error');
      }
    } catch (err) {
      logApiError('Cashier.handleRefund', err);
      notify('退费出错', 'error');
    }
  };

  // 渲染收费单详情
  const renderChargeDetails = (charge: ChargeVO) => {
    const details = charge.details || charge.items || [];
    const canPay = charge.status === RegistrationStatus.WAITING;
    const canRefund = (
      charge.status === (RegistrationStatus.PAID_REGISTRATION as number) ||
      charge.status === (RegistrationStatus.IN_CONSULTATION as number) ||
      charge.status === (RegistrationStatus.COMPLETED as number)
    );

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b bg-slate-50/30">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold text-slate-800">收费单详情</h3>
              <p className="text-sm text-slate-500 mt-1">单号：{charge.chargeNo}</p>
              <p className="text-xs text-slate-400 mt-1">
                患者：{charge.patientName} | 状态：{charge.statusDesc}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">¥{formatCurrency(charge.totalAmount)}</div>
              <div className="text-xs text-slate-500">总金额</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 bg-slate-50/50 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">项目名称</th>
                <th className="px-4 py-3 text-left">类型</th>
                <th className="px-4 py-3 text-right">金额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {details.map((item: ChargeDetailVO, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{item.itemName || item.name}</td>
                  <td className="px-4 py-3 text-slate-500">{item.itemType || item.type}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-700">
                    ¥{formatCurrency(item.itemAmount ?? item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t bg-slate-50/30 flex justify-end gap-3">
          {canPay && (
            <button
              onClick={() => openPaymentModal(charge)}
              className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            >
              <CheckCircle size={18} /> 确认收费
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => handleRefund(charge.id)}
              className="px-6 py-2.5 bg-red-50 text-red-600 font-bold rounded-lg border border-red-200 hover:bg-red-100 hover:border-red-300 transition-all flex items-center gap-2"
            >
              <XCircle size={18} /> 申请退费
            </button>
          )}
          <button className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-2">
            <Receipt size={18} />
            打印票据
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 overflow-hidden">
      {/* 顶部导航 */}
      <div className="bg-white border-b px-6 pt-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('charges')}
            className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'charges'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CreditCard size={18} /> 收费单管理
          </button>
          <button
            onClick={() => setActiveTab('registrations')}
            className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'registrations'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={18} /> 开单作业
          </button>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
            title="退出登录"
          >
            <LogOut size={18} />
            退出系统
          </button>
        </div>
      </div>

      {/* Debug banner */}
      <div className="px-6 pt-2">
        <div className="inline-flex items-center gap-3 px-3 py-1 bg-yellow-50 border border-yellow-100 text-yellow-800 text-xs rounded">
          <div className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[11px] font-medium flex items-center gap-1">
            <User size={12} />
            {user?.name}
          </div>
          <span>当前模块: <strong className="text-slate-700">{activeTab === 'charges' ? '收费单管理' : '开单作业'}</strong></span>
          <span>收费单数: <strong className="text-slate-700">{charges.length}</strong></span>
          <span>挂号单数: <strong className="text-slate-700">{registrations.length}</strong></span>
          <span>状态: <strong className={`ml-1 ${loading ? 'text-blue-700' : 'text-green-700'}`}>{loading ? 'loading' : 'ok'}</strong></span>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden mt-2">
        {activeTab === 'charges' ? (
          <>
            {/* 左侧：收费单列表 */}
            <div className="w-1/3 border-r bg-white flex flex-col">
              <div className="p-4 border-b space-y-3">
                <h2 className="font-bold text-slate-700 flex items-center gap-2">
                  <CreditCard className="text-blue-600" size={20} /> 收费单列表
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="搜索收费单号..."
                    className="w-full pl-9 p-2 bg-slate-50 border rounded-lg text-sm outline-none focus:border-blue-500"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadCharges()}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 text-xs rounded-lg border-2 transition-all font-medium ${
                      statusFilter === 'all'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    全部阶段
                  </button>
                  {[
                    RegistrationStatus.WAITING,
                    RegistrationStatus.PAID_REGISTRATION,
                    RegistrationStatus.COMPLETED
                  ].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 text-xs rounded-lg border-2 transition-all font-medium ${
                        statusFilter === status
                          ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      {registrationStatusLabels[status]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                    <Activity size={24} className="animate-pulse" />
                    加载中...
                  </div>
                ) : charges.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                    <FileText size={32} className="text-slate-300" />
                    暂无记录
                  </div>
                ) : (
                  charges.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCharge(c)}
                      className={`p-4 border-b cursor-pointer hover:bg-slate-50 transition-all ${
                        selectedCharge?.id === c.id
                          ? 'bg-blue-50 border-l-4 border-l-blue-500'
                          : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-slate-700">{c.patientName}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-medium">
                          {c.statusDesc}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span className="font-mono">{c.chargeNo}</span>
                        <span className="font-bold text-slate-700">¥{formatCurrency(c.totalAmount)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{c.createdAt || c.createTime}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：收费单详情 */}
            <div className="flex-1 bg-slate-50 p-6 flex flex-col">
              {selectedCharge ? (
                renderChargeDetails(selectedCharge)
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <FileText size={64} className="mb-4 text-slate-200" />
                  <p className="text-sm">请选择左侧收费单查看详情</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 开单作业：挂号列表 */}
            <div className="w-1/3 border-r bg-white flex flex-col">
              <div className="p-4 border-b space-y-3">
                <h2 className="font-bold text-slate-700 flex items-center gap-2">
                  <FileText className="text-green-600" size={20} /> 挂号列表
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="搜索患者姓名/挂号号..."
                    className="w-full pl-9 p-2 bg-slate-50 border rounded-lg text-sm outline-none focus:border-green-500"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadRegistrations()}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                    <Activity size={24} className="animate-pulse" />
                    加载中...
                  </div>
                ) : registrations.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                    <ClipboardList size={32} className="text-slate-300" />
                    暂无挂号记录
                  </div>
                ) : (
                  registrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="p-4 border-b hover:bg-blue-50/30 transition-all"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-slate-700">{reg.patientName}</div>
                          <div className="text-xs text-slate-400">{reg.regNo}</div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 font-medium">
                          {reg.statusDesc}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mb-3">
                        科室：{reg.deptName} | 医生：{reg.doctorName}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => openCreateChargeModal('registration', reg.id)}
                          className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border border-blue-200 hover:border-blue-300"
                          title="仅收挂号费"
                        >
                          <Plus size={14} />
                          挂号费
                        </button>
                        <button
                          onClick={() => openCreateChargeModal('prescription', reg.id)}
                          className="px-2 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border border-green-200 hover:border-green-300"
                          title="仅收处方费"
                        >
                          <Plus size={14} />
                          处方费
                        </button>
                        <button
                          onClick={() => openCreateChargeModal('combined', reg.id)}
                          className="px-2 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border border-purple-200 hover:border-purple-300"
                          title="普通开单（合并收费）"
                        >
                          <Plus size={14} />
                          合并
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：开单说明 */}
            <div className="flex-1 bg-slate-50 p-6 flex flex-col items-center justify-center">
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 max-w-2xl">
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <DollarSign size={24} className="text-green-600" />
                  分阶段收费说明
                </h3>
                <div className="space-y-4 text-sm text-slate-600">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <h4 className="font-bold text-blue-700 mb-2 flex items-center gap-2">
                      <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                      仅收挂号费
                    </h4>
                    <p className="text-blue-600 ml-8">患者挂号时立即收取挂号费，快速完成挂号流程。</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                    <h4 className="font-bold text-green-700 mb-2 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                      仅收处方费
                    </h4>
                    <p className="text-green-600 ml-8">医生开具处方并审核通过后，患者单独支付处方费。</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                    <h4 className="font-bold text-purple-700 mb-2 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                      普通开单（合并收费）
                    </h4>
                    <p className="text-purple-600 ml-8">同时收取挂号费和处方费（向后兼容传统模式）。</p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-xs text-slate-400">
                    💡 提示：请根据患者就诊流程选择合适的开单模式，分阶段收费可优化就诊体验，减少排队次数。
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 支付弹窗 */}
      {paymentModal.visible && paymentModal.charge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 transform transition-all">
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <DollarSign size={20} className="text-green-600" />
                收银台
              </h3>
            </div>

            <div className="p-6 space-y-6">
              {/* 应收金额 */}
              <div className="bg-linear-to-br from-blue-50 to-indigo-50 p-6 rounded-xl text-center border border-blue-100">
                <div className="text-sm text-slate-600 mb-2 font-medium">应收金额</div>
                <div className="text-5xl font-bold text-blue-600">
                  ¥{formatCurrency(paymentModal.charge.totalAmount)}
                </div>
              </div>

              {/* 支付方式选择 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">选择支付方式</label>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map((method) => (
                    <label
                      key={method.value}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        paymentMethod === method.value
                          ? method.colorClass
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === method.value}
                        onChange={() => setPaymentMethod(method.value)}
                        className="hidden"
                      />
                      <span className="text-2xl">{method.icon}</span>
                      <span className="font-medium text-slate-700">{method.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 支付提示 */}
              <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                <p className="text-xs text-yellow-700">
                  ⚡ 模拟支付模式：点击确认后将自动完成支付（3秒后成功）
                </p>
              </div>
            </div>

            <div className="p-6 border-t flex gap-3">
              <button
                onClick={() => setPaymentModal({ visible: false, charge: null })}
                className="flex-1 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 font-medium transition-all"
              >
                取消
              </button>
              <button
                onClick={handleConfirmPayment}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md hover:shadow-lg transition-all"
              >
                确认收款
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 开单弹窗 */}
      {createChargeModal.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 transform transition-all">
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Plus size={20} className="text-blue-600" />
                创建收费单
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                模式：
                {createChargeModal.mode === 'registration' && '仅收挂号费'}
                {createChargeModal.mode === 'prescription' && '仅收处方费'}
                {createChargeModal.mode === 'combined' && '普通开单（合并收费）'}
              </p>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600">
                确认为挂号单 <strong>#{createChargeModal.registrationId}</strong> 创建收费单？
              </p>
            </div>

            <div className="p-6 border-t flex gap-3">
              <button
                onClick={() => setCreateChargeModal({ visible: false, mode: null })}
                className="flex-1 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 font-medium transition-all"
              >
                取消
              </button>
              <button
                onClick={handleCreateCharge}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md hover:shadow-lg transition-all"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cashier;
