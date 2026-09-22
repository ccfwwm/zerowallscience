/** Runtime limit applies to the spawned Python process and its own descendants. */
export const BRAIN_RESOURCE_GUARD=String.raw`import os, sys, threading, time, psutil
_zw_process=psutil.Process(os.getpid())
_zw_peak_rss=[0]
_zw_memory_limit=24*1024**3
if psutil.virtual_memory().available < 2*1024**3:
    raise RuntimeError('BrainGlobe needs at least 2 GiB available memory to start')
def _zw_watch_memory():
    while True:
        try:
            children=_zw_process.children(recursive=True)
            total=0
            for process in [_zw_process]+children:
                try: total+=process.memory_info().rss
                except psutil.Error: pass
            _zw_peak_rss[0]=max(_zw_peak_rss[0],total)
            if total>_zw_memory_limit:
                print('BrainGlobe process tree exceeded its 24 GiB memory budget; operation interrupted.',file=sys.stderr,flush=True)
                for process in reversed(children):
                    try: process.kill()
                    except psutil.Error: pass
                os._exit(137)
        except psutil.Error: pass
        time.sleep(0.5)
threading.Thread(target=_zw_watch_memory,daemon=True).start()
`
