import { useState, useEffect } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { Site } from '../types';

export function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sites')
      .then(res => res.json())
      .then(data => {
        setSites(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Connected Sites</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage your WordPress installations and their sync status.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            type="button"
            className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <Plus className="-ml-0.5 h-5 w-5" aria-hidden="true" />
            Add Site
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">
                Site Name
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                URL
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                Status
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                Analyzed Pages
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                Last Sync
              </th>
              <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-500">Loading sites...</td>
              </tr>
            ) : sites.map((site) => (
              <tr key={site.id} className="hover:bg-slate-50 transition-colors">
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 sm:pl-6">
                  {site.name}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                  <a href={site.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-900">
                    {site.url}
                  </a>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      site.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        : site.status === 'syncing'
                        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                        : 'bg-red-50 text-red-700 ring-red-600/20'
                    }`}
                  >
                    {site.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">{site.pageCount}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                  {new Date(site.lastSync).toLocaleString()}
                </td>
                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                  <button className="text-slate-400 hover:text-slate-500">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
