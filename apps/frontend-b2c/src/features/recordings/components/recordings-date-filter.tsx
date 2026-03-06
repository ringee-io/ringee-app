'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Calendar } from '@ringee/frontend-shared/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { CalendarIcon, XCircle } from 'lucide-react';
import { useQueryState, parseAsString } from 'nuqs';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { cn } from '@ringee/frontend-shared/lib/utils';

export function RecordingsDateFilter() {
    const [dateFrom, setDateFrom] = useQueryState(
        'dateFrom',
        parseAsString.withDefault('')
    );
    const [dateTo, setDateTo] = useQueryState(
        'dateTo',
        parseAsString.withDefault('')
    );

    const selectedRange: DateRange = {
        from: dateFrom ? new Date(dateFrom) : undefined,
        to: dateTo ? new Date(dateTo) : undefined
    };

    const handleSelect = (range: DateRange | undefined) => {
        if (range?.from) {
            setDateFrom(range.from.toISOString());
        } else {
            setDateFrom('');
        }
        if (range?.to) {
            setDateTo(range.to.toISOString());
        } else {
            setDateTo('');
        }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDateFrom('');
        setDateTo('');
    };

    const hasValue = dateFrom || dateTo;

    const formatLabel = () => {
        if (!selectedRange.from && !selectedRange.to) {
            return 'Filter by date';
        }
        if (selectedRange.from && selectedRange.to) {
            return `${format(selectedRange.from, 'MMM d')} - ${format(selectedRange.to, 'MMM d, yyyy')}`;
        }
        if (selectedRange.from) {
            return `From ${format(selectedRange.from, 'MMM d, yyyy')}`;
        }
        return `To ${format(selectedRange.to!, 'MMM d, yyyy')}`;
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn('border-dashed', hasValue && 'border-primary')}
                >
                    {hasValue ? (
                        <div
                            role="button"
                            aria-label="Clear date filter"
                            tabIndex={0}
                            onClick={handleClear}
                            className="focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
                        >
                            <XCircle className="h-4 w-4" />
                        </div>
                    ) : (
                        <CalendarIcon className="h-4 w-4" />
                    )}
                    <span className="ml-2">{formatLabel()}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    initialFocus
                    mode="range"
                    selected={selectedRange}
                    onSelect={handleSelect}
                    numberOfMonths={2}
                />
            </PopoverContent>
        </Popover>
    );
}
