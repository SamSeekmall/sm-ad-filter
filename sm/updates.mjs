// Download staging keeps network waits outside the settings transaction queue.
export async function stageLists(lists, signal, progress) {
    const entries = {}; let bytes = 0;
    async function visit(url, depth = 0) {
        if (Object.hasOwn(entries,url)) return;
        if (depth > 10 || Object.keys(entries).length >= 100) throw new Error('订阅包含过多文件');
        entries[url] = {error:'下载未完成'};
        try {
            const response = await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const reader=response.body.getReader(), decoder=new TextDecoder(); let text='';
            for (;;) { const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength;
                if(bytes>4000000){await reader.cancel();throw new Error('订阅下载超过 4 MB');}
                text+=decoder.decode(value,{stream:true}); }
            text+=decoder.decode(); entries[url]={content:text};
            for(const match of text.matchAll(/^!#include\s+(\S+)/gm)) {
                const child=new URL(match[1],url);
                if(child.origin===new URL(url).origin) await visit(child.href,depth+1);
            }
        } catch(error) { if(signal.aborted)throw error; entries[url]={error:error.message}; }
        progress(Object.keys(entries).length,bytes);
    }
    for(const list of lists.filter(x=>x.enabled)) await visit(list.id);
    return entries;
}
