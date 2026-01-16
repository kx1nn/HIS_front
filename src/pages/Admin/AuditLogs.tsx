import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auditApi } from '../../services/api';
import type { AuditLogEntity, PageAuditLogEntity } from '../../types';
import { FileText, Search, Download, RotateCw } from 'lucide-react';

const AuditLogsPage: React.FC = () => {
  const navigate = useNavigate();
  const [pageData, setPageData] = useState<PageAuditLogEntity | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);

  const [filters, setFilters] = useState({
    operatorUsername: '',
    module: '',
    action: '',
    auditType: '',
    traceId: '',
    startTime: '',
    endTime: ''
  });

  const load = async (p = page, s = size) => {
    try {
      const params: Record<string, unknown> = { page: p, size: s };
      Object.keys(filters).forEach((k) => {
        const v = (filters as Record<string, string>)[k];
        if (v) (params as Record<string, unknown>)[k] = v;
      });
      const res = await auditApi.search(params);
      setPageData(res);
      setPage(res?.number ?? 0);
    } catch (err) {
      console.error('audit logs load failed', err);
    }
  };

  useEffect(() => {
    load(0, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => { load(0, size); };
  const handleReset = () => {
    setFilters({ operatorUsername: '', module: '', action: '', auditType: '', traceId: '', startTime: '', endTime: '' });
    load(0, size);
  };

  const handleExport = async () => {
    try {
      // 请求较大页，后端应支持导出/或返回全部（开发环境允许）
      const res = await auditApi.search({ ...filters, page: 0, size: 10000 });
      const items = res?.content ?? [];
      const csv = convertToCSV(items);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('export failed', err);
    }
  };

  const convertToCSV = (items: AuditLogEntity[]) => {
    if (!items || items.length === 0) return '';
    const headers = ['id','createTime','operatorUsername','operatorId','module','action','auditType','status','executionTime','traceId','requestIp','exceptionType','exceptionMessage','description'] as const;
    const rows = items.map(it => headers.map(h => JSON.stringify(it[h as keyof AuditLogEntity] ?? '')).join(','));
    return `${headers.join(',')}\n${rows.join('\n')}`;
  };

  return (
    <div className="h-full bg-slate-50 p-8 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg"><FileText size={24} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">审计日志管理</h1>
              <p className="text-slate-500">查询系统操作审计日志，支持导出用于安全分析</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => load(page, size)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white"> <RotateCw size={16} /> 刷新</button>
            <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white"> 返回</button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input className="p-2 border rounded" placeholder="操作人用户名" value={filters.operatorUsername} onChange={e => setFilters(f => ({...f, operatorUsername: e.target.value}))} />
            <input className="p-2 border rounded" placeholder="模块名" value={filters.module} onChange={e => setFilters(f => ({...f, module: e.target.value}))} />
            <input className="p-2 border rounded" placeholder="操作名" value={filters.action} onChange={e => setFilters(f => ({...f, action: e.target.value}))} />
            <select className="p-2 border rounded" value={filters.auditType} onChange={e => setFilters(f => ({...f, auditType: e.target.value}))}>
              <option value="">全部类型</option>
              <option value="SENSITIVE_OPERATION">SENSITIVE_OPERATION</option>
              <option value="BUSINESS">BUSINESS</option>
              <option value="DATA_ACCESS">DATA_ACCESS</option>
            </select>
            <input type="date" className="p-2 border rounded" value={filters.startTime} onChange={e => setFilters(f => ({...f, startTime: e.target.value}))} />
            <input type="date" className="p-2 border rounded" value={filters.endTime} onChange={e => setFilters(f => ({...f, endTime: e.target.value}))} />
            <input className="p-2 border rounded col-span-2" placeholder="TraceId" value={filters.traceId} onChange={e => setFilters(f => ({...f, traceId: e.target.value}))} />
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={handleSearch} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white"><Search size={16} /> 查询</button>
            <button onClick={handleReset} className="px-4 py-2 rounded-xl border">重置</button>
            <button onClick={handleExport} className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border bg-white"> <Download size={16}/> 导出 CSV</button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border p-4 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                <tr>
                  <th className="px-4 py-2">时间</th>
                  <th className="px-4 py-2">操作人</th>
                  <th className="px-4 py-2">模块</th>
                  <th className="px-4 py-2">操作</th>
                  <th className="px-4 py-2">类型</th>
                  <th className="px-4 py-2">状态</th>
                  <th className="px-4 py-2">耗时(ms)</th>
                  <th className="px-4 py-2">TraceId</th>
                  <th className="px-4 py-2">描述</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(pageData?.content ?? []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(log.createTime).toLocaleString()}</td>
                    <td className="px-4 py-2">{log.operatorUsername}</td>
                    <td className="px-4 py-2">{log.module}</td>
                    <td className="px-4 py-2">{log.action}</td>
                    <td className="px-4 py-2">{log.auditType}</td>
                    <td className="px-4 py-2">{log.status}</td>
                    <td className="px-4 py-2">{log.executionTime ?? '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs break-all">{log.traceId}</td>
                    <td className="px-4 py-2 text-sm">{log.description ?? '-'}</td>
                  </tr>
                ))}
                {(!pageData || (pageData?.content?.length ?? 0) === 0) && (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-slate-500">共 {pageData?.totalElements ?? 0} 条</div>
            <div className="flex items-center gap-2">
              <button disabled={pageData?.first} onClick={() => { const p = Math.max(0, (pageData?.number ?? 0) - 1); setPage(p); load(p, size); }} className="px-3 py-1 border rounded">上一页</button>
              <span className="px-3 py-1">{(pageData?.number ?? 0) + 1} / {pageData?.totalPages ?? 1}</span>
              <button disabled={pageData?.last} onClick={() => { const p = (pageData?.number ?? 0) + 1; setPage(p); load(p, size); }} className="px-3 py-1 border rounded">下一页</button>
              <select className="p-1 border rounded" value={size} onChange={e => { const s = Number(e.target.value); setSize(s); load(0, s); }}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AuditLogsPage;
