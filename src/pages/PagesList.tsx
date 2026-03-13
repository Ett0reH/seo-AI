import { useState, useEffect } from 'react';
import { Code2, Search, Filter, X } from 'lucide-react';
import { AnalyzedPage } from '../types';

export function PagesList() {
  const [pages, setPages] = useState<AnalyzedPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<AnalyzedPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pages')
      .then(res => res.json())
      .then(data => {
        setPages(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pages & Content</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review AI-generated semantic layers, schema.org types, and search intents.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by URL or title..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <Filter className="h-4 w-4" />
          Filters
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">
                Page
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                Topic & Intent
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                Schema Type
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                Status
              </th>
              <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-slate-500">Loading pages...</td>
              </tr>
            ) : pages.map((page) => (
              <tr key={page.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-4 pl-4 pr-3 text-sm sm:pl-6">
                  <div className="font-medium text-slate-900">{page.title}</div>
                  <div className="text-slate-500 text-xs mt-1">{page.url}</div>
                </td>
                <td className="px-3 py-4 text-sm">
                  <div className="text-slate-900">{page.topic}</div>
                  <div className="text-slate-500 text-xs mt-1">{page.searchIntent}</div>
                </td>
                <td className="px-3 py-4 text-sm text-slate-500">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                    {page.schemaType}
                  </span>
                </td>
                <td className="px-3 py-4 text-sm text-slate-500">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      page.status === 'auto-published'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        : page.status === 'manual-override'
                        ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                        : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                    }`}
                  >
                    {page.status.replace('-', ' ')}
                  </span>
                </td>
                <td className="relative py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                  <button
                    onClick={() => setSelectedPage(page)}
                    className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-900"
                  >
                    <Code2 className="h-4 w-4" />
                    View JSON-LD
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* JSON-LD Modal */}
      {selectedPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedPage(null)} />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Semantic Layer (JSON-LD)</h2>
                <p className="text-sm text-slate-500">{selectedPage.url}</p>
              </div>
              <button
                onClick={() => setSelectedPage(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              <pre className="text-sm font-mono text-slate-800 bg-white p-4 rounded-lg border border-slate-200 overflow-x-auto">
                {typeof selectedPage.jsonLd === 'string' ? selectedPage.jsonLd : JSON.stringify(selectedPage.jsonLd, null, 2)}
              </pre>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3 bg-white rounded-b-2xl">
              <button
                onClick={() => setSelectedPage(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg"
              >
                Close
              </button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg">
                Edit Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
