import { Controller, Get, Query } from "@nestjs/common";
import { CallService } from "@ringee/services";
import { Call } from "@ringee/database";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";

interface CurrentUserData {
    id: string;
    activeOrgId?: string | null;
}

@Controller("recordings")
export class RecordingsController {
    constructor(private readonly callService: CallService) { }

    @Get()
    async findAll(
        @CurrentUser() user: CurrentUserData,
        @Query("dateFrom") dateFrom?: string,
        @Query("dateTo") dateTo?: string,
        @Query("page") page?: number,
        @Query("limit") limit?: number,
    ): Promise<{
        data: Call[];
        total: number;
        page: number;
        totalPages: number;
    }> {
        const ctx = createOwnershipContext(user);

        return this.callService.listWithRecordings({
            ctx,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
            page,
            limit,
        });
    }
}
