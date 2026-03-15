import { IsNumber, IsDateString, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsNumber()
  patientId: number;

  @IsDateString()
  date: string;

  @IsString()
  time: string;
}
