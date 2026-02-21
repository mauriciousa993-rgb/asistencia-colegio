# TODO - Implement User Edit/Delete Features

## Backend (server.js)
- [ ] Add PUT /api/usuarios/:id endpoint to update users
- [ ] Add DELETE /api/usuarios/:id endpoint to delete users
- [ ] Add validation to prevent self-deletion
- [ ] Add password hashing for password updates

## Frontend (app.js)
- [ ] Add edit and delete buttons to users table in renderTablaUsuarios()
- [ ] Create editarUsuario() function to load user data into form
- [ ] Create eliminarUsuario() function with confirmation dialog
- [ ] Modify guardarUsuario() to handle both create and update operations
- [ ] Add hidden user ID field to the form
- [ ] Update UI to show "Editar Usuario" vs "Crear Usuario" mode
- [ ] Add cancel edit button functionality

## Testing
- [ ] Test user creation
- [ ] Test user editing
- [ ] Test user deletion
- [ ] Verify admin-only access

