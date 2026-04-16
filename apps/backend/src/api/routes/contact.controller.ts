import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CreateContactDto,
  UpdateContactDto,
  AddNoteDto,
  CurrentUser,
  createOwnershipContext,
  CSV_IMPORT_CONFIG,
} from "@ringee/platform";
import { ContactService } from "@ringee/services";
import { TriggerLoopEventPublisher } from "../../triggerloop/services/triggerloop-event-publisher.service";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("contacts")
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly triggerLoop: TriggerLoopEventPublisher,
  ) { }

  @Post()
  async createContact(
    @Body() body: CreateContactDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.contactService.createContact(ctx, body);
  }

  @Post("import")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: CSV_IMPORT_CONFIG.MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith(".csv")) {
          cb(new BadRequestException("Only CSV files are allowed"), false);
        } else {
          cb(null, true);
        }
      },
    })
  )
  async importContacts(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @CurrentUser() user: CurrentUserData,
    @Body("tagIds") tagIdsRaw?: string,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    const ctx = createOwnershipContext(user);
    const csvContent = file.buffer.toString("utf-8");
    
    // Parse tagIds from form data (can be comma-separated or JSON array)
    let tagIds: string[] | undefined;
    if (tagIdsRaw) {
      try {
        tagIds = JSON.parse(tagIdsRaw);
      } catch {
        tagIds = tagIdsRaw.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
    
    const result = await this.contactService.importContacts(
      ctx,
      csvContent,
      tagIds,
    );

    // Only emit once the import actually produced rows — a failed or empty
    // import shouldn't trigger the follow-up workflow.
    if (result.success && result.summary.inserted > 0) {
      await this.triggerLoop.contactsImported(user.id, result.summary.inserted);
    }

    return result;
  }

  @Post("find-or-create")
  async findOrCreate(
    @Body() body: { phoneNumber: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.contactService.findOrCreateByPhone(ctx, body.phoneNumber);
  }

  @Get(":id")
  async getContact(@Param("id") id: string) {
    return this.contactService.getContactById(id);
  }

  @Get(":id/activities")
  async getContactActivities(@Param("id") id: string) {
    return this.contactService.getContactActivities(id);
  }

  @Get()
  async listContacts(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("sort") sort?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "10",
    @Query("tags") tagsRaw?: string | string[],
  ) {
    const ctx = createOwnershipContext(user);
    
    // Parse tags from query param
    let tagIds: string[] | undefined;
    if (tagsRaw) {
      if (Array.isArray(tagsRaw)) {
        tagIds = tagsRaw;
      } else {
        tagIds = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
    
    return this.contactService.listContacts(
      ctx,
      search,
      sort,
      Number(page),
      Number(limit),
      tagIds,
    );
  }

  @Put(":id")
  async updateContact(
    @Param("id") id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactService.updateContact(id, {
      organization: dto.organization,
      name: dto.name,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      jobTitle: dto.jobTitle,
      source: dto.source,
      tagIds: dto.tagIds,
    });
  }

  @Post(":id/notes")
  async addNote(
    @Param("id") contactId: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.contactService.addNoteToContact(user.id, contactId, dto);
  }

  @Delete(":id/notes/:noteId")
  async deleteNote(
    @Param("id") contactId: string,
    @Param("noteId") noteId: string,
  ) {
    return this.contactService.deleteNote(contactId, noteId);
  }

  @Delete("by-tags")
  async deleteByTags(
    @CurrentUser() user: CurrentUserData,
    @Body("tagIds") tagIds: string[],
  ) {
    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      throw new BadRequestException("tagIds array is required");
    }
    const ctx = createOwnershipContext(user);
    return this.contactService.deleteContactsByTags(ctx, tagIds);
  }

  @Delete(":id")
  async deleteContact(@Param("id") id: string) {
    return this.contactService.deleteContact(id);
  }
}
