import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// PrimeNG Imports
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { PanelModule } from 'primeng/panel';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { DrawerModule } from 'primeng/drawer';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { DialogModule } from 'primeng/dialog';
import { SpeedDialModule } from 'primeng/speeddial';
import { SplitButtonModule } from 'primeng/splitbutton';
import { StepsModule } from 'primeng/steps';
import { CheckboxModule } from 'primeng/checkbox';
import { ChipModule } from 'primeng/chip';
import { DropdownModule } from 'primeng/dropdown';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TabsModule } from 'primeng/tabs';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { FieldsetModule } from 'primeng/fieldset';
import { MenuModule } from 'primeng/menu';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ListboxModule } from 'primeng/listbox';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { PopoverModule } from 'primeng/popover';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SliderModule } from 'primeng/slider';
import { InputSwitchModule } from 'primeng/inputswitch';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ToastModule,
    ButtonModule,
    ProgressSpinnerModule,
    PanelModule,
    TableModule,
    TagModule,
    ProgressBarModule,
    MessageModule,
    TooltipModule,
    DrawerModule,
    ScrollPanelModule,
    DialogModule,
    SpeedDialModule,
    SplitButtonModule,
    StepsModule,
    CheckboxModule,
    ChipModule,
    DropdownModule,
    ConfirmDialogModule,
    TabsModule,
    ToggleButtonModule,
    ChartModule,
    CardModule,
    FieldsetModule,
    MenuModule,
    RadioButtonModule,
    SelectButtonModule,
    ListboxModule,
    OverlayPanelModule,
    PopoverModule,
    ToggleSwitchModule,
    SliderModule,
    InputSwitchModule,
    ProgressSpinnerModule,
    SelectModule,
    InputNumberModule,
  ],
  exports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ToastModule,
    ButtonModule,
    ProgressSpinnerModule,
    PanelModule,
    TableModule,
    TagModule,
    ProgressBarModule,
    MessageModule,
    TooltipModule,
    DrawerModule,
    ScrollPanelModule,
    DialogModule,
    SpeedDialModule,
    SplitButtonModule,
    StepsModule,
    CheckboxModule,
    ChipModule,
    DropdownModule,
    ConfirmDialogModule,
    TabsModule,
    ToggleButtonModule,
    ChartModule,
    CardModule,
    FieldsetModule,
    MenuModule,
    RadioButtonModule,
    SelectButtonModule,
    ListboxModule,
    OverlayPanelModule,
    PopoverModule,
    ToggleSwitchModule,
    SliderModule,
    InputSwitchModule,
    ProgressSpinnerModule,
    SelectModule,
    InputNumberModule,
  ],
  providers: [MessageService]
})
export class SharedModule { } 