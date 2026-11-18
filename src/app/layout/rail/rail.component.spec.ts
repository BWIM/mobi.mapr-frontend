import { ComponentFixture, TestBed } from '@angular/core/testing';
import { testProviders } from '../../testing/test-providers';

import { RailComponent } from './rail.component';

describe('RailComponent', () => {
  let component: RailComponent;
  let fixture: ComponentFixture<RailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RailComponent],
      providers: testProviders(),
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
