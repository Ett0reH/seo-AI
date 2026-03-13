import { useState, useEffect } from 'react';
import { Network, ExternalLink } from 'lucide-react';
import { Entity } from '../types';

export function Entities() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/entities')
      .then(res => res.json())
      .then(data => {
        setEntities(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Entity Graph</h1>
          <p className="mt-2 text-sm text-slate-600">
            Global entities extracted across all connected WordPress sites.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading entities...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <div
              key={entity.id}
              className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                  <Network className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{entity.name}</h3>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {entity.type}
                  </span>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-900">{entity.mentions}</span> mentions
                </div>
                {entity.wikipediaUrl && (
                  <a
                    href={entity.wikipediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-900"
                  >
                    Wikipedia <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
