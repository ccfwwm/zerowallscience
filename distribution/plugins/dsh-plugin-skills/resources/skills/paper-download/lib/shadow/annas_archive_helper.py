"""
Anna's Archive API - Python port from Openlib Flutter app
Uses cloudscraper to bypass DDoS protection.
"""
import cloudscraper
from bs4 import BeautifulSoup
from dataclasses import dataclass
from typing import Optional, List
import re


@dataclass
class BookData:
    title: str
    link: str
    md5: str
    author: Optional[str] = None
    thumbnail: Optional[str] = None
    publisher: Optional[str] = None
    info: Optional[str] = None


@dataclass
class BookInfoData(BookData):
    mirror: Optional[str] = None
    description: Optional[str] = None
    format: Optional[str] = None


class AnnasArchive:
    BASE_URL = "https://annas-archive.gl"

    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    }

    def __init__(self):
        self.session = cloudscraper.create_scraper()
        self.session.headers.update(self.HEADERS)

    def get_md5(self, url: str) -> str:
        """Extract MD5 from URL path"""
        parts = url.rstrip('/').split('/')
        return parts[-1] if parts else ''

    def get_format(self, info: str) -> str:
        """Determine file format from info string"""
        info_lower = info.lower()
        if 'pdf' in info_lower:
            return 'pdf'
        elif 'cbr' in info_lower:
            return 'cbr'
        elif 'cbz' in info_lower:
            return 'cbz'
        return 'epub'

    def search_books(
        self,
        query: str,
        content: str = "",
        sort: str = "",
        file_type: str = "",
        enable_filters: bool = True
    ) -> List[BookData]:
        """Search for books on Anna's Archive"""

        query_encoded = query.replace(" ", "+")

        if not enable_filters:
            url = f"{self.BASE_URL}/search?q={query_encoded}"
        else:
            url = f"{self.BASE_URL}/search?index=&q={query_encoded}&content={content}&ext={file_type}&sort={sort}"

        response = self.session.get(url)
        response.raise_for_status()

        return self._parse_search_results(response.text, file_type)

    def _parse_search_results(self, html: str, file_type: str) -> List[BookData]:
        """Parse search results HTML"""
        soup = BeautifulSoup(html, 'html.parser')

        book_containers = soup.select('div.flex.pt-3.pb-3.border-b')
        books = []

        for container in book_containers:
            # Main link with title
            main_link = container.select_one('a.line-clamp-\\[3\\].js-vim-focus')
            if not main_link or not main_link.get('href'):
                continue

            title = main_link.get_text(strip=True)
            href = main_link['href']
            link = self.BASE_URL + href
            md5 = self.get_md5(href)

            # Thumbnail
            thumb_elem = container.select_one('a[href^="/md5/"] img')
            thumbnail = thumb_elem['src'] if thumb_elem and thumb_elem.get('src') else None

            # Author and publisher (next siblings of main link)
            author = None
            publisher = None

            next_elem = main_link.find_next_sibling('a')
            if next_elem and next_elem.get('href', '').startswith('/search?q='):
                author = next_elem.get_text(strip=True)
                # Clean author if it contains icon text
                if author and 'icon-' in author:
                    author = ' '.join(author.split()[1:]).strip()

                pub_elem = next_elem.find_next_sibling('a')
                if pub_elem and pub_elem.get('href', '').startswith('/search?q='):
                    publisher = pub_elem.get_text(strip=True)

            # Info/metadata
            info_elem = container.select_one('div.text-gray-800')
            info = info_elem.get_text(strip=True) if info_elem else None

            # Filter by file type
            if file_type:
                if info and file_type.lower() not in info.lower():
                    continue
            else:
                if info and not re.search(r'(PDF|EPUB|CBR|CBZ)', info, re.IGNORECASE):
                    continue

            books.append(BookData(
                title=title,
                author=author or "unknown",
                thumbnail=thumbnail,
                link=link,
                md5=md5,
                publisher=publisher or "unknown",
                info=info
            ))

        return books

    def get_book_info(self, url: str) -> Optional[BookInfoData]:
        """Get detailed book information"""
        response = self.session.get(url)
        response.raise_for_status()

        return self._parse_book_info(response.text, url)

    def _parse_book_info(self, html: str, url: str) -> Optional[BookInfoData]:
        """Parse book detail page"""
        soup = BeautifulSoup(html, 'html.parser')

        main = soup.select_one('div.main-inner')
        if not main:
            return None

        # Mirror link
        mirror = None
        slow_download = main.select_one('ul.list-inside a[href*="/slow_download/"]')
        if slow_download and slow_download.get('href'):
            mirror = self.BASE_URL + slow_download['href']

        # Title
        title_elem = main.select_one('div.font-semibold.text-2xl')
        if not title_elem:
            return None
        title = title_elem.get_text(strip=True).split('<span')[0].strip()

        # Author
        author_elem = main.select_one('a[href^="/search?q="].text-base')
        author = author_elem.get_text(strip=True) if author_elem else "unknown"

        # Publisher
        publisher = "unknown"
        if author_elem:
            pub_elem = author_elem.find_next_sibling('a')
            if pub_elem and pub_elem.get('href', '').startswith('/search?q='):
                publisher = pub_elem.get_text(strip=True)

        # Thumbnail
        thumb_elem = main.select_one('div[id^="list_cover_"] img')
        thumbnail = thumb_elem['src'] if thumb_elem and thumb_elem.get('src') else None

        # Info
        info_elem = main.select_one('div.text-gray-800')
        info = info_elem.get_text(strip=True) if info_elem else ""

        # Description
        description = ""
        desc_label = main.select_one('div.js-md5-top-box-description div.text-xs.text-gray-500.uppercase')
        if desc_label and 'description' in desc_label.get_text(strip=True).lower():
            desc_elem = desc_label.find_next_sibling()
            if desc_elem:
                description = desc_elem.get_text(strip=True)

        return BookInfoData(
            title=title,
            author=author,
            thumbnail=thumbnail,
            publisher=publisher,
            info=info,
            link=url,
            md5=self.get_md5(url),
            format=self.get_format(info),
            mirror=mirror,
            description=description
        )


# Test
if __name__ == "__main__":
    api = AnnasArchive()
    results = []

    print("=== Test: Recherche 'python programming' ===")
    try:
        results = api.search_books("python programming", file_type="pdf")
        print(f"✓ {len(results)} results found")
        for book in results[:3]:
            print(f"  - {book.title[:60]}...")
            print(f"    Auteur: {book.author}")
            print(f"    MD5: {book.md5}")
            print()
    except Exception as e:
        print(f"✗ Erreur: {e}")

    print("\n=== Test: book details ===")
    if results:
        try:
            book_info = api.get_book_info(results[0].link)
            if book_info:
                print(f"✓ Titre: {book_info.title}")
                print(f"  Format: {book_info.format}")
                print(f"  Mirror: {book_info.mirror}")
                print(f"  Description: {book_info.description[:100]}..." if book_info.description else "  Description: N/A")
        except Exception as e:
            print(f"✗ Erreur: {e}")
    else:
        print("✗ No results to test details with")
