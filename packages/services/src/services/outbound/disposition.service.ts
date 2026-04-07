import { Injectable, NotFoundException } from "@nestjs/common";
import {
  DispositionRepository,
  Disposition,
  DispositionCategory,
} from "@ringee/database";

export interface CreateDispositionDto {
  code: string;
  label: string;
  category: DispositionCategory;
  color?: string;
  sortOrder?: number;
  triggersRetry?: boolean;
  triggersCompletion?: boolean;
  triggersDnc?: boolean;
  triggersCallback?: boolean;
}

/** Default dispositions seeded when a campaign is created. */
const DEFAULT_DISPOSITIONS: (Omit<CreateDispositionDto, "color" | "sortOrder"> &
  { sortOrder: number; isSystem: boolean })[] = [
  {
    code: "meeting_booked",
    label: "Meeting Booked",
    category: DispositionCategory.positive,
    triggersCompletion: true,
    sortOrder: 0,
    isSystem: true,
  },
  {
    code: "sale",
    label: "Sale",
    category: DispositionCategory.positive,
    triggersCompletion: true,
    sortOrder: 1,
    isSystem: true,
  },
  {
    code: "interested",
    label: "Interested",
    category: DispositionCategory.positive,
    triggersCallback: true,
    sortOrder: 2,
    isSystem: true,
  },
  {
    code: "follow_up",
    label: "Follow Up",
    category: DispositionCategory.neutral,
    triggersCallback: true,
    sortOrder: 3,
    isSystem: true,
  },
  {
    code: "gatekeeper",
    label: "Gatekeeper",
    category: DispositionCategory.neutral,
    triggersRetry: true,
    sortOrder: 4,
    isSystem: true,
  },
  {
    code: "not_interested",
    label: "Not Interested",
    category: DispositionCategory.negative,
    sortOrder: 5,
    isSystem: true,
  },
  {
    code: "wrong_number",
    label: "Wrong Number",
    category: DispositionCategory.negative,
    triggersDnc: true,
    sortOrder: 6,
    isSystem: true,
  },
  {
    code: "no_answer",
    label: "No Answer",
    category: DispositionCategory.no_contact,
    triggersRetry: true,
    sortOrder: 7,
    isSystem: true,
  },
  {
    code: "voicemail",
    label: "Voicemail",
    category: DispositionCategory.no_contact,
    triggersRetry: true,
    sortOrder: 8,
    isSystem: true,
  },
  {
    code: "busy",
    label: "Busy",
    category: DispositionCategory.no_contact,
    triggersRetry: true,
    sortOrder: 9,
    isSystem: true,
  },
];

@Injectable()
export class DispositionService {
  constructor(private readonly dispositionRepo: DispositionRepository) {}

  async seedDefaults(campaignId: string): Promise<number> {
    return this.dispositionRepo.createMany(
      DEFAULT_DISPOSITIONS.map((d) => ({ ...d, campaignId }))
    );
  }

  async listByCampaign(campaignId: string): Promise<Disposition[]> {
    return this.dispositionRepo.findByCampaign(campaignId);
  }

  async getById(id: string): Promise<Disposition> {
    const disposition = await this.dispositionRepo.findById(id);
    if (!disposition) throw new NotFoundException("Disposition not found");
    return disposition;
  }

  async create(
    campaignId: string,
    dto: CreateDispositionDto
  ): Promise<Disposition> {
    return this.dispositionRepo.create({ ...dto, campaignId });
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Disposition,
        | "label"
        | "color"
        | "sortOrder"
        | "triggersRetry"
        | "triggersCompletion"
        | "triggersDnc"
        | "triggersCallback"
        | "isActive"
      >
    >
  ): Promise<Disposition> {
    return this.dispositionRepo.update(id, data);
  }

  async deactivate(id: string): Promise<Disposition> {
    return this.dispositionRepo.delete(id);
  }
}
