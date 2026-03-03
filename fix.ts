import * as fs from 'fs';
let content = fs.readFileSync('components/UniversityDetail.tsx', 'utf8');

// The section is around 384
const startIdx = content.indexOf('<TabsContent value="signals" className="mt-6">');
if (startIdx !== -1) {
  const endIdx = content.indexOf('</TabsContent>', startIdx);
  if (endIdx !== -1) {
    const replacement = `<TabsContent value="sources" className="mt-6">
        {activeUniversity && universitySignals?.[activeUniversity] ? (
          <div className="space-y-4">
            {universitySignals[activeUniversity].signals
              .filter((s) => s.type === 'source')
              .length === 0 ? (
                <div className="py-12 text-center text-zinc-500">No sources found.</div>
              ) : (
                universitySignals[activeUniversity].signals
                  .filter((s) => s.type === 'source')
                  .map((signal, idx) => (
                    <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="mb-2 font-medium text-zinc-800 break-all">
                        <a href={signal.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2">
                          <ExternalLink className="h-4 w-4" />
                          {signal.url}
                        </a>
                      </div>
                      {signal.query && (
                        <div className="text-sm text-zinc-500">
                          Query: <span className="italic">{signal.query}</span>
                        </div>
                      )}
                      {signal.published && (
                        <div className="text-xs text-zinc-400 mt-2">
                          Published: {new Date(signal.published * 1000).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))
              )}
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-500">Select a university to view sources.</div>
        )}
      `;
    
    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
    fs.writeFileSync('components/UniversityDetail.tsx', content);
    console.log('Fixed TabsContent for sources');
  } else {
    console.log('Could not find </TabsContent>');
  }
} else {
  console.log('Could not find <TabsContent value="signals"');
}
