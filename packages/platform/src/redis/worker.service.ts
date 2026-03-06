import { Injectable, Inject, Logger, OnModuleInit } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { lastValueFrom } from "rxjs";

/**
 * Job types for background processing
 */
export enum JobType {
  PROCESS_CALL_RECORDING = "process_call_recording",
}

/**
 * Job priority levels
 */
export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
}

export interface JobOptions {
  priority?: JobPriority;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: "fixed" | "exponential";
    delay: number;
  };
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

/**
 * Job data structure
 */
export interface Job<T = unknown> {
  id?: string;
  type: JobType;
  data: T;
  options?: JobOptions;
}

/**
 * Worker service for managing background jobs using Redis
 */
@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);

  constructor(@Inject("WORKER_SERVICE") private readonly client: ClientProxy) { }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log("Worker service connected to Redis");
    } catch (error) {
      this.logger.error("Failed to connect to Redis:", error);
    }
  }

  async addJob<T>(job: Job<T>): Promise<string> {
    try {
      const jobId = job.id || crypto.randomUUID();
      const jobWithId = { ...job, id: jobId };

      await lastValueFrom(
        this.client.emit("ringee_add_job", {
          ...jobWithId,
          options: {
            priority: JobPriority.NORMAL,
            attempts: 3,
            removeOnComplete: true,
            ...job.options,
          },
        }),
      );

      this.logger.debug(`Job added (emitted): ${job.type} - ID: ${jobId}`);
      return jobId;
    } catch (error) {
      this.logger.error(`Error adding job ${job.type}:`, error);
      throw error;
    }
  }

  async addJobs<T>(jobs: Job<T>[]): Promise<string[]> {
    try {
      const promises = jobs.map((job) => this.addJob(job));
      return await Promise.all(promises);
    } catch (error) {
      this.logger.error("Error adding multiple jobs:", error);
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<unknown> {
    try {
      const result = await lastValueFrom(
        this.client.send("get_job_status", { jobId }),
      );
      return result;
    } catch (error) {
      this.logger.error(`Error getting job status for ${jobId}:`, error);
      throw error;
    }
  }

  async removeJob(jobId: string): Promise<void> {
    try {
      await lastValueFrom(
        this.client.send("ringee_remove_job", { jobId }),
      );
      this.logger.debug(`Job removed: ${jobId}`);
    } catch (error) {
      this.logger.error(`Error removing job ${jobId}:`, error);
      throw error;
    }
  }

  async processCallRecording(data: {
    callControlId: string;
    recording: {
      publicUrl: string;
      privateUrl: string;
      recordingStartedAt: string;
      recordingEndedAt: string;
    };
  }): Promise<string> {
    return this.addJob({
      type: JobType.PROCESS_CALL_RECORDING,
      data,
      options: { priority: JobPriority.NORMAL },
    });
  }

  async emit(event: string, data: unknown): Promise<void> {
    try {
      await lastValueFrom(this.client.emit(event, data));
      this.logger.debug(`Event emitted: ${event}`);
    } catch (error) {
      this.logger.error(`Error emitting event ${event}:`, error);
      throw error;
    }
  }
}
