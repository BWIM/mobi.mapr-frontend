import { ComponentFixture, TestBed } from '@angular/core/testing';
import { testProviders } from '../../testing/test-providers';

import { BottomComponent } from './bottom.component';

describe('BottomComponent', () => {
  let component: BottomComponent;
  let fixture: ComponentFixture<BottomComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomComponent],
      providers: testProviders(),
    })
    .compileComponents();

    fixture = TestBed.createComponent(BottomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
