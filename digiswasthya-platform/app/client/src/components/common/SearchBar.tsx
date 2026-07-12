import React from 'react';
import { Search, Filter } from 'lucide-react';
import Input from './Input';
import Button from './Button';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilterClick?: () => void;
  showFilter?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  placeholder = 'Search...', 
  value, 
  onChange,
  onFilterClick,
  showFilter = false
}) => {
  return (
    <div className="flex items-center space-x-2">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      </div>
      {showFilter && (
        <Button variant="secondary" onClick={onFilterClick} leftIcon={<Filter className="h-4 w-4" />}>
          Filter
        </Button>
      )}
    </div>
  );
};

export default SearchBar;
