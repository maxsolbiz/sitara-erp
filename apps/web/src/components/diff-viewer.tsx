'use client';
interface DiffViewerProps {
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
}

export function DiffViewer({ oldValues, newValues }: DiffViewerProps) {
  if (!oldValues && !newValues) return (
    <p className="text-xs text-muted-foreground">No details available</p>
  );

  const allKeys = Array.from(new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ])).filter(k => !['id','createdAt','updatedAt','deletedAt','password','token'].includes(k));

  const changedKeys = allKeys.filter(k => {
    const oldVal = JSON.stringify((oldValues || {})[k]);
    const newVal = JSON.stringify((newValues || {})[k]);
    return oldVal !== newVal;
  });

  if (changedKeys.length === 0) return (
    <p className="text-xs text-muted-foreground">No field changes detected</p>
  );

  return (
    <div className="text-xs font-mono">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left p-2 font-semibold w-1/4">Field</th>
            <th className="text-left p-2 font-semibold w-[37.5%] text-red-700">Before</th>
            <th className="text-left p-2 font-semibold w-[37.5%] text-green-700">After</th>
          </tr>
        </thead>
        <tbody>
          {changedKeys.map(key => {
            const oldVal = (oldValues || {})[key];
            const newVal = (newValues || {})[key];
            const displayVal = (v: any) =>
              v === null || v === undefined ? '—'
              : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
              : typeof v === 'object' ? JSON.stringify(v)
              : String(v);
            return (
              <tr key={key} className="border-t">
                <td className="p-2 text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</td>
                <td className="p-2 bg-red-50 text-red-800 max-w-0"><span className="block truncate">{displayVal(oldVal)}</span></td>
                <td className="p-2 bg-green-50 text-green-800 max-w-0"><span className="block truncate">{displayVal(newVal)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
