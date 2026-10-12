"""网络操作重试机制 — 自动重试网络失败的操作"""
import time
import functools


def retry_on_network_error(max_retries=2, delay=2, backoff=2):
    """装饰器：网络失败时自动重试（指数退避）。
    
    捕获 ConnectionError, TimeoutError, OSError 并重试。
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except (ConnectionError, TimeoutError, OSError) as e:
                    last_error = e
                    if attempt < max_retries:
                        wait = delay * (backoff ** attempt)
                        time.sleep(wait)
                    continue
                except Exception as e:
                    # 非网络错误不重试
                    raise
            raise last_error
        return wrapper
    return decorator
