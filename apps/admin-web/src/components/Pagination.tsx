import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  // Build page numbers to show
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-6">
      <p className="text-sm text-gray-500">
        Showing <span className="font-semibold text-gray-700">{start}</span>–<span className="font-semibold text-gray-700">{end}</span> of{' '}
        <span className="font-semibold text-gray-700">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          style={currentPage === 1 ? {} : { color: '#374151' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((page, i) =>
          page === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-gray-400 text-sm">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className="min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-all cursor-pointer"
              style={
                page === currentPage
                  ? { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', boxShadow: '0 2px 4px rgba(0,140,229,0.3)' }
                  : { color: '#6B7280' }
              }
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          style={currentPage === totalPages ? {} : { color: '#374151' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
