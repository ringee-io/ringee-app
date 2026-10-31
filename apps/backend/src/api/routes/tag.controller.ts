import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from "@nestjs/common";
import {
  CreateTagDto,
  UpdateTagDto,
  AssignTagsDto,
  CurrentUser,
  createOwnershipContext,
} from "@ringee/platform";
import { TagService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("tags")
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  async createTag(
    @Body() body: CreateTagDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.tagService.createTag(ctx, body);
  }

  @Get()
  async listTags(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.tagService.listTags(ctx);
  }

  @Get(":id")
  async getTag(@Param("id") id: string, @CurrentUser() user: CurrentUserData) {
    return this.tagService.getTagById(createOwnershipContext(user), id);
  }

  @Put(":id")
  async updateTag(
    @Param("id") id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tagService.updateTag(createOwnershipContext(user), id, dto);
  }

  @Delete(":id")
  async deleteTag(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tagService.deleteTag(createOwnershipContext(user), id);
  }
}

@Controller("contacts")
export class ContactTagController {
  constructor(private readonly tagService: TagService) {}

  @Get(":contactId/tags")
  async getContactTags(
    @Param("contactId") contactId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tagService.getContactTags(
      createOwnershipContext(user),
      contactId,
    );
  }

  @Post(":contactId/tags")
  async assignTags(
    @Param("contactId") contactId: string,
    @Body() dto: AssignTagsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tagService.setContactTags(
      createOwnershipContext(user),
      contactId,
      dto.tagIds,
    );
  }

  @Delete(":contactId/tags")
  async removeTags(
    @Param("contactId") contactId: string,
    @Body() dto: AssignTagsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const count = await this.tagService.removeTagsFromContact(
      createOwnershipContext(user),
      contactId,
      dto.tagIds,
    );
    return { removed: count };
  }
}
