import { IsNumber, IsDateString, Min, Max } from 'class-validator';

export class UpsertCycleDto {
  @IsNumber()
  year: number;

  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class BulkUpsertCyclesDto {
  cycles: UpsertCycleDto[];
}
