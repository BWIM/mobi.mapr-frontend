import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RailComponent } from './rail.component';

describe('RailComponent', () => {
  let component: RailComponent;
  let fixture: ComponentFixture<RailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
