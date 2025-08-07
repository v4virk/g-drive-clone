import React, { useState, useEffect } from 'react'
import { auth } from './firebaseConfig'
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth'

import axios from 'axios'
import './App.css'

// Material UI imports
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import InputBase from '@mui/material/InputBase'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import LogoutIcon from '@mui/icons-material/Logout'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash'
import DeleteIcon from '@mui/icons-material/Delete'
import { styled, alpha } from '@mui/material/styles'

// Styled search components
const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.25) },
  marginLeft: theme.spacing(2),
  width: 'auto',
}))

const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}))

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: 'inherit',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '20ch',
  },
}))

interface FileItem {
  id: number
  name: string
  size: number
  content_type: string
  created_at: string
  starred?: boolean
  trashed?: boolean
}

interface PaginationInfo {
  currentPage: number
  totalItems: number
  totalPages: number
  itemsPerPage: number
  hasNext: boolean
  hasPrev: boolean
}

interface FilesResponse {
  files: FileItem[]
  pagination: PaginationInfo
}

export default function App() {
  // Authentication states
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // File data and UI states
  const [files, setFiles] = useState<FileItem[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [section, setSection] = useState('My Drive') // Sections: My Drive, Recent, Starred, Trash

  const api = axios.create({ baseURL: '/api', timeout: 30000 })

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user && user.email === 'harvijayxsingh@gmail.com') {
        setUserEmail(user.email)
        setLoginOpen(false)
        fetchFiles()
      } else {
        setUserEmail(null)
        setLoginOpen(true)
        signOut(auth)
      }
    })
    return unsubscribe
  }, [])

  // Login handler
  const handleLogin = () => {
    signInWithEmailAndPassword(auth, email.trim(), password)
      .catch(() => alert('Invalid email or password'))
  }

  // Logout handler
  const handleLogout = () => {
    signOut(auth).catch(console.error)
  }

  // Fetch files from backend
  const fetchFiles = async (page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<FilesResponse>(`/files?page=${page}&limit=100`)
      setFiles(response.data.files)
      setPagination(response.data.pagination)
    } catch (err) {
      setError('Failed to fetch files')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Upload file handler
  const uploadFile = async (file: File) => {
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.post('/files', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      await fetchFiles(pagination?.currentPage || 1)
    } catch (err) {
      setError('Failed to upload file')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  // Move file to trash (soft delete)
  const moveToTrash = async (fileId: number) => {
    try {
      await api.post(`/files/${fileId}/trash`)
      await fetchFiles(pagination?.currentPage || 1)
    } catch (err) {
      setError('Failed to move file to Trash')
      console.error(err)
    }
  }

  // Restore file from trash
  const restoreFile = async (fileId: number) => {
    try {
      await api.post(`/files/${fileId}/restore`)
      await fetchFiles(pagination?.currentPage || 1)
    } catch (err) {
      setError('Failed to restore file')
      console.error(err)
    }
  }

  // Permanently delete file
  const deletePermanently = async (fileId: number) => {
    if (!confirm('Permanently delete this file? This action cannot be undone.')) return
    try {
      await api.delete(`/files/${fileId}`)
      await fetchFiles(pagination?.currentPage || 1)
    } catch (err) {
      setError('Failed to permanently delete file')
      console.error(err)
    }
  }

  // Download file handler
  const downloadFile = async (fileId: number) => {
    try {
      const response = await api.get(`/files/${fileId}/download`)
      window.open(response.data.downloadUrl, '_blank')
    } catch (err) {
      setError('Failed to download file')
      console.error(err)
    }
  }

  // Toggle star/unstar file
  const toggleStar = async (file: FileItem) => {
    try {
      if (file.starred) {
        await api.post(`/files/${file.id}/unstar`)
      } else {
        await api.post(`/files/${file.id}/star`)
      }
      await fetchFiles(pagination?.currentPage || 1)
    } catch (err) {
      setError('Failed to update star status')
      console.error(err)
    }
  }

  // Drag-and-drop handlers
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  // Utility for formatting file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Utility for formatting date
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  // Filter files by search term and current section
  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    switch (section) {
      case 'My Drive':
        return !file.trashed && matchesSearch
      case 'Starred':
        return !file.trashed && file.starred && matchesSearch
      case 'Trash':
        return file.trashed && matchesSearch
      case 'Recent':
        return !file.trashed && matchesSearch
      default:
        return false
    }
  })

  if (loginOpen) {
    // Show login dialog until authenticated
    return (
      <Dialog open={loginOpen} maxWidth="xs" fullWidth>
        <DialogTitle>Sign In</DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" label="Email" type="email" fullWidth variant="standard" value={email} onChange={e => setEmail(e.target.value)} />
          <TextField margin="dense" label="Password" type="password" fullWidth variant="standard" value={password} onChange={e => setPassword(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogin} variant="contained">Login</Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <div className="App" style={{ height: '100vh' }}>
      {/* AppBar with search, upload, user email and logout */}
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setSidebarOpen(true)} aria-label="menu">
            ☰
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Drive Clone</Typography>
          <Search>
            <SearchIconWrapper><SearchIcon /></SearchIconWrapper>
            <StyledInputBase
              placeholder="Search…"
              inputProps={{ 'aria-label': 'search' }}
              onChange={e => setSearchTerm(e.target.value)}
              value={searchTerm}
            />
          </Search>
          <IconButton color="inherit" onClick={() => document.getElementById('fileInput')?.click()} aria-label="upload">
            <AddIcon />
          </IconButton>
          <Typography sx={{ ml: 2 }}>{userEmail}</Typography>
          <IconButton color="inherit" onClick={handleLogout} aria-label="logout" title="Logout">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Hidden file input element */}
      <input id="fileInput" type="file" hidden onChange={e => e.target.files && uploadFile(e.target.files[0])} />

      {/* Sidebar navigation */}
      <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} variant="temporary">
        <List>
          {['My Drive', 'Recent', 'Starred', 'Trash'].map(txt => (
            <ListItem
              button
              key={txt}
              selected={section === txt}
              onClick={() => {
                setSection(txt)
                setSidebarOpen(false)
              }}
            >
              <ListItemText primary={txt} />
            </ListItem>
          ))}
        </List>
      </Drawer>

      {/* Main content with 85% file list and 15% drag & drop */}
      <div className="main-content" style={{ display: 'flex', height: 'calc(100% - 64px)', overflow: 'hidden' }}>
        {/* File list area, 85% */}
        <div style={{ width: '85%', overflowY: 'auto', padding: 20 }}>
          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError(null)} aria-label="Close error">✕</button>
            </div>
          )}

          <div className="files-section">
            <div className="section-header">
              <Typography variant="h5" component="h2" sx={{ mb: 2, fontWeight: 600 }}>
                {section} {section === 'Starred' && '⭐'} {section === 'Trash' && '🗑️'}
              </Typography>
            </div>

            {loading ? (
              <div className="loading">
                <div className="spinner" />
                <p>Loading files...</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  {section === 'Starred' ? '⭐' : section === 'Trash' ? '🗑️' : '📄'}
                </div>
                <p>No files found in {section}</p>
                {section === 'Starred' && <p>Star files to see them here</p>}
                {section === 'Trash' && <p>Deleted files will appear here</p>}
              </div>
            ) : (
              <div className="files-grid" role="list" aria-label={`${section} files list`}>
                {filteredFiles.map(file => (
                  <div key={file.id} className="file-card" role="listitem">
                    <div
                      onClick={() => setPreviewFile(file)}
                      style={{ cursor: 'pointer', fontSize: '2rem' }}
                      aria-label={`Preview ${file.name}`}
                      tabIndex={0}
                      onKeyPress={e => { if (e.key === 'Enter' || e.key === ' ') setPreviewFile(file) }}
                      role="button"
                    >
                      {file.content_type.startsWith('image/')
                        ? '🖼️'
                        : file.content_type.startsWith('video/')
                          ? '🎥'
                          : file.content_type.startsWith('audio/')
                            ? '🎵'
                            : file.content_type.includes('pdf')
                              ? '📄'
                              : '📁'}
                    </div>

                    <div className="file-info">
                      <h3 className="file-name" title={file.name}>
                        {file.name}
                        {file.starred && <StarIcon sx={{ ml: 1, fontSize: '1rem', color: '#ffd700' }} />}
                      </h3>
                      <p className="file-details">
                        {formatFileSize(file.size)} • {formatDate(file.created_at)}
                        {file.trashed && <span style={{ color: '#ff6b6b', marginLeft: 8 }}>• In Trash</span>}
                      </p>
                    </div>

                    <div className="file-actions" style={{ whiteSpace: 'nowrap' }}>
                      {/* Star button - only show in My Drive and Starred sections */}
                      {(section === 'My Drive' || section === 'Starred') && (
                        <IconButton
                          aria-label={file.starred ? "Unstar file" : "Star file"}
                          onClick={() => toggleStar(file)}
                          size="small"
                          color={file.starred ? "warning" : "default"}
                        >
                          {file.starred ? <StarIcon /> : <StarBorderIcon />}
                        </IconButton>
                      )}

                      {/* Move to Trash button - show in My Drive, Recent, and Starred */}
                      {section !== 'Trash' && (
                        <IconButton 
                          aria-label="Move to Trash" 
                          onClick={() => moveToTrash(file.id)} 
                          size="small" 
                          color="error"
                          title="Move to Trash"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}

                      {/* Trash section specific buttons */}
                      {section === 'Trash' && (
                        <>
                          <IconButton 
                            aria-label="Restore" 
                            onClick={() => restoreFile(file.id)} 
                            size="small" 
                            color="success"
                            title="Restore File"
                          >
                            <RestoreFromTrashIcon />
                          </IconButton>
                          <IconButton 
                            aria-label="Delete Permanently" 
                            onClick={() => deletePermanently(file.id)} 
                            size="small" 
                            color="error"
                            title="Delete Permanently"
                          >
                            <DeleteForeverIcon />
                          </IconButton>
                        </>
                      )}

                      {/* Download button - available in all sections */}
                      <Button 
                        size="small" 
                        onClick={() => downloadFile(file.id)} 
                        aria-label={`Download ${file.name}`} 
                        sx={{ minWidth: '70px', ml: 1 }}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drag and drop upload area 15% fixed on right */}
        <div
          className={`upload-area ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
          style={{
            width: '15%',
            minWidth: '180px',
            maxWidth: '280px',
            height: '100%',
            position: 'relative',
            boxShadow: 'inset 0 0 8px rgba(0, 0, 0, 0.1)',
            borderRadius: 12,
            backgroundColor: '#fafafa',
            border: dragOver ? '2px solid #667eea' : '2px dashed #ccc',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            transition: 'border-color 0.3s, background-color 0.3s',
            userSelect: 'none',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          aria-label="File upload area"
        >
          <div className="upload-content" style={{ padding: 20, textAlign: 'center' }}>
            {uploading ? (
              <div className="upload-progress">
                <div className="spinner" />
                <p>Uploading file...</p>
              </div>
            ) : (
              <>
                <div className="upload-icon" style={{ fontSize: '3rem' }}>📁</div>
                <p>Drag and drop files here or</p>
                <label
                  htmlFor="fileInput"
                  style={{
                    backgroundColor: '#667eea',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'inline-block',
                    marginTop: 4,
                  }}
                >
                  Choose File
                </label>
                <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Maximum file size: 100MB</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewFile} onClose={() => setPreviewFile(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {previewFile?.name || ''}
          <IconButton
            aria-label="Close preview"
            onClick={() => setPreviewFile(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            ✕
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ textAlign: 'center' }}>
          {previewFile && previewFile.content_type.startsWith('image/') ? (
            <img
              src={`/api/files/${previewFile.id}/download`}
              alt={previewFile.name}
              style={{ maxWidth: '100%', maxHeight: '80vh' }}
            />
          ) : previewFile && previewFile.content_type === 'application/pdf' ? (
            <iframe
              src={`/api/files/${previewFile.id}/download`}
              width="100%"
              height="600px"
              title={previewFile.name}
              style={{ border: 'none' }}
            />
          ) : previewFile ? (
            <>
              <p>No preview available.</p>
              <Button variant="contained" href={`/api/files/${previewFile.id}/download`} download>
                Download File
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
