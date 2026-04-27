import { IsNumber, IsDateString, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  patientId: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '13:00' })
  @IsString()
  time: string;
}
