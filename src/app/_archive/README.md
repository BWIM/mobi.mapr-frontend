# Archived Components

This directory contains components that have been archived during the clean dashboard migration.

## Structure

- `components/` - UI components to be migrated back
- `features/` - Feature modules to be migrated back
- `legacy/` - Components likely to be dropped

## Migration Status

### Components (to be migrated)
- ✅ `analyze/` - Analysis component
- ✅ `credits/` - Credits component
- ✅ `details-sidebar/` - Details sidebar
- ✅ `legend/` - Map legend
- ✅ `projects/` - Projects component (without project-wizard)
- ✅ `share/` - Share functionality
- ✅ `statistics/` - Statistics component
- ✅ `loading-spinner/` - Loading spinner

### Features (to be migrated)
- ✅ `dashboard/` - Old dashboard component (service kept active)
- ✅ `map-v2/` - Map component (CORE - migrate early)

### Legacy (likely dropped)
- ✅ `project-wizard/` - Project creation wizard (obsolete for new dashboard)

## Notes

- Core services in `services/` are kept active
- Auth components in `auth/` are kept active
- Landing and maintenance pages are kept active
- Layout components are kept active (already migrated)
