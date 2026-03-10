// ...existing inline <script> code from index.html moved here...

// 1. Supabase 초기화
const SUPABASE_URL = 'https://eqxdedztebcbgbblxody.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxeGRlZHp0ZWJjYmdiYmx4b2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjQ1MDksImV4cCI6MjA4ODQ0MDUwOX0.WpSF-sResnQKk2dEmIL4q9WS90gWEBTjdQpENmyOOjo'; // 기존 값으로 교체
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. 전역 변수
let selectedFile = null;
let postsCache = [];
let authorsCache = [];

// 3. 이미지 미리보기
window.showPreview = function (event) {
    const file = event.target.files[0];
    const preview = document.getElementById('imagePreview');
    const container = document.getElementById('previewContainer');

    if (file) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = function (e) {
            preview.src = e.target.result;
            container.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        cancelPreview();
    }
};

// 4. 미리보기 취소
window.cancelPreview = function () {
    selectedFile = null;
    const input = document.getElementById('imageInput');
    const preview = document.getElementById('imagePreview');
    const container = document.getElementById('previewContainer');

    if (input) input.value = '';
    if (preview) preview.src = '';
    if (container) container.style.display = 'none';
};

// 5. 게시물 업로드
window.uploadPost = async function () {
    const author = document.getElementById('authorInput').value.trim();
    const artist = document.getElementById('artistInput').value.trim();
    const title = document.getElementById('titleInput').value.trim();
    const year = document.getElementById('yearInput').value.trim();
    const desc = document.getElementById('descInput').value.trim();
    const sourceUrl = (document.getElementById('sourceUrlInput')?.value || '').trim();

    if (!author || !artist || !title) {
        alert('글쓴이, 작가, 제목은 필수입니다.');
        return;
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
        alert('자료 출처 URL은 http(s):// 로 시작해야 합니다.');
        return;
    }

    let imageUrl = null;
    let imagePath = null;

    try {
        if (selectedFile) {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`;
            imagePath = fileName;

            const { error: storageError } = await supabaseClient.storage
                .from('images')
                .upload(fileName, selectedFile, { upsert: false });

            if (storageError) throw storageError;

            const { data: publicUrlData } = supabaseClient.storage
                .from('images')
                .getPublicUrl(fileName);

            imageUrl = publicUrlData.publicUrl;
        }

        const { error: insertError } = await supabaseClient
            .from('posts')
            .insert([
                {
                    author,
                    artist,
                    title,
                    year: year || null,
                    description: desc || null,
                    source_url: sourceUrl || null,
                    image_url: imageUrl,
                    image_path: imagePath,
                },
            ]);

        if (insertError) throw insertError;

        document.getElementById('authorInput').value = '';
        document.getElementById('artistInput').value = '';
        document.getElementById('titleInput').value = '';
        document.getElementById('yearInput').value = '';
        document.getElementById('descInput').value = '';
        const srcEl = document.getElementById('sourceUrlInput');
        if (srcEl) srcEl.value = '';
        cancelPreview();

        await refreshAuthorsAndUI();
        await fetchPosts(document.getElementById('authorFilter').value || 'all');
    } catch (error) {
        console.error(error);
        alert('업로드 중 오류가 발생했습니다. (Supabase 권한/테이블 컬럼을 확인하세요)');
    }
};

// 6. 게시물 불러오기
async function fetchPostsInternal(filterAuthor = 'all') {
    let query = supabaseClient.from('posts').select('*').order('created_at', { ascending: false });

    if (filterAuthor !== 'all') {
        query = query.eq('author', filterAuthor);
    }

    const { data, error } = await query;

    if (error) {
        console.error(error);
        alert('데이터를 불러오는 중 오류가 발생했습니다.');
        return [];
    }

    return data || [];
}

async function fetchAuthorsInternal() {
    // distinct author list, independent from current filter
    const { data, error } = await supabaseClient
        .from('posts')
        .select('author')
        .not('author', 'is', null);

    if (error) {
        console.warn('failed to fetch authors list:', error);
        return [];
    }

    const authors = Array.from(new Set((data || []).map((r) => (r.author || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ko'));
    return authors;
}

function renderAuthorUI({ selectedAuthor }) {
    const authorFilter = document.getElementById('authorFilter');
    const authorTags = document.getElementById('authorTags');
    if (!authorFilter || !authorTags) return;

    // rebuild select
    authorFilter.innerHTML = '<option value="all">전체 보기</option>';
    authorsCache.forEach((author) => {
        const option = document.createElement('option');
        option.value = author;
        option.textContent = author;
        authorFilter.appendChild(option);
    });

    // preserve selection even after rebuilding
    authorFilter.value = authorsCache.includes(selectedAuthor) ? selectedAuthor : 'all';

    // rebuild tags (quick entry only)
    authorTags.innerHTML = '';
    authorsCache.forEach((author) => {
        const tag = document.createElement('button');
        tag.className = 'author-tag';
        tag.type = 'button';
        tag.textContent = author;
        tag.addEventListener('click', () => {
            const authorInput = document.getElementById('authorInput');
            if (authorInput) {
                authorInput.value = author;
                authorInput.focus();
            }
        });
        authorTags.appendChild(tag);
    });
}

window.fetchPosts = async function (filterAuthor = 'all') {
    const authorFilterEl = document.getElementById('authorFilter');
    const selectedAuthor = filterAuthor || (authorFilterEl ? authorFilterEl.value : 'all') || 'all';

    const posts = await fetchPostsInternal(selectedAuthor);
    postsCache = posts;

    // Only refresh author list when needed:
    // - first load (authorsCache empty)
    // - after writes (upload/save/delete) should call refreshAuthorsAndUI()
    if (authorsCache.length === 0) {
        authorsCache = await fetchAuthorsInternal();
    }

    renderAuthorUI({ selectedAuthor });
    renderPosts(posts);
};

async function refreshAuthorsAndUI() {
    const authorFilterEl = document.getElementById('authorFilter');
    const selectedAuthor = authorFilterEl?.value || 'all';
    authorsCache = await fetchAuthorsInternal();
    renderAuthorUI({ selectedAuthor });
}

// 7. 모달 관련
function openModal(imageUrl, postOrCaption) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');

    modalImage.src = imageUrl;

    // caption을 텍스트로만 넣지 말고 구조화
    modalCaption.innerHTML = '';
    if (postOrCaption && typeof postOrCaption === 'object') {
        const a = document.createElement('div');
        a.className = 'mc-artist';
        a.textContent = safeText(postOrCaption.artist);

        const t = document.createElement('div');
        t.className = 'mc-title';
        t.textContent = safeText(postOrCaption.title);

        const y = document.createElement('div');
        y.className = 'mc-year';
        y.textContent = postOrCaption.year ? safeText(postOrCaption.year) : '';

        modalCaption.appendChild(a);
        modalCaption.appendChild(t);
        if (postOrCaption.year) modalCaption.appendChild(y);
    } else {
        modalCaption.textContent = safeText(postOrCaption);
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');

    modalImage.src = '';
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

window.openModalById = function (id) {
    const post = postsCache.find((p) => p.id === id);
    if (!post || !post.image_url) return;
    openModal(post.image_url, post);
}

function safeText(value) {
    return value == null ? '' : String(value);
}

function buildCaption(post) {
    const wrap = document.createElement('div');
    wrap.className = 'caption';
    wrap.id = `caption-${post.id}`;

    const artist = document.createElement('div');
    artist.className = 'artist-name';
    artist.textContent = safeText(post.artist);

    const title = document.createElement('div');
    title.className = 'work-title';
    title.textContent = safeText(post.title);

    const year = document.createElement('div');
    year.className = 'work-year';
    year.textContent = post.year ? safeText(post.year) : '';

    const note = document.createElement('div');
    note.className = 'work-note';
    note.textContent = post.description ? safeText(post.description) : '';

    const postedBy = document.createElement('div');
    postedBy.className = 'posted-by';
    postedBy.textContent = `posted by ${safeText(post.author)}`;

    wrap.appendChild(artist);
    wrap.appendChild(title);
    if (post.year) wrap.appendChild(year);
    if (post.description) wrap.appendChild(note);

    if (post.source_url) {
        const a = document.createElement('a');
        a.className = 'work-source';
        a.href = post.source_url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '자료 출처';
        wrap.appendChild(a);
    }

    const controls = document.createElement('div');
    controls.className = 'edit-controls';

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.type = 'button';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => toggleEditMode(post.id));

    controls.appendChild(editBtn);
    wrap.appendChild(controls);

    wrap.appendChild(postedBy);

    return wrap;
}

function renderPosts(posts) {
    const feed = document.getElementById('feed');
    feed.innerHTML = '';

    posts.forEach((post) => {
        const card = document.createElement('div');
        card.className = 'post-card';

        if (post.image_url) {
            const img = document.createElement('img');
            img.src = post.image_url;
            img.alt = post.title || '';
            img.loading = 'lazy';
            img.addEventListener('click', () => openModalById(post.id));
            card.appendChild(img);
        }

        card.appendChild(buildCaption(post));
        feed.appendChild(card);
    });
}

function toggleEditMode(id) {
    const post = postsCache.find((p) => p.id === id);
    if (!post) return;

    const caption = document.getElementById(`caption-${id}`);
    if (!caption) return;

    if (caption.dataset.editing === '1') return;
    caption.dataset.editing = '1';
    caption.classList.add('edit-mode-active');

    const original = {
        artist: post.artist || '',
        title: post.title || '',
        year: post.year || '',
        description: post.description || '',
        author: post.author || '',
        source_url: post.source_url || '',
    };

    caption.innerHTML = '';

    const artistInput = document.createElement('input');
    artistInput.className = 'edit-input';
    artistInput.value = original.artist;

    const titleInput = document.createElement('input');
    titleInput.className = 'edit-input';
    titleInput.value = original.title;

    const yearInput = document.createElement('input');
    yearInput.className = 'edit-input';
    yearInput.value = original.year;

    const descInput = document.createElement('textarea');
    descInput.className = 'edit-input';
    descInput.value = original.description;

    const authorInput = document.createElement('input');
    authorInput.className = 'edit-input';
    authorInput.value = original.author;

    const sourceInput = document.createElement('input');
    sourceInput.className = 'edit-input';
    sourceInput.value = original.source_url;
    sourceInput.placeholder = '자료 출처 URL';

    caption.appendChild(artistInput);
    caption.appendChild(titleInput);
    caption.appendChild(yearInput);
    caption.appendChild(descInput);
    caption.appendChild(sourceInput);
    caption.appendChild(authorInput);

    const controls = document.createElement('div');
    controls.className = 'edit-controls';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-btn';
    saveBtn.textContent = '저장';
    saveBtn.addEventListener('click', async () => {
        await savePost(id, {
            artist: artistInput.value.trim(),
            title: titleInput.value.trim(),
            year: yearInput.value.trim(),
            description: descInput.value.trim(),
            author: authorInput.value.trim(),
            source_url: sourceInput.value.trim(),
        });
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-btn-inline';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', () => {
        caption.dataset.editing = '0';
        caption.classList.remove('edit-mode-active');
        // 원본 캡션으로 복구
        const refreshed = postsCache.find((p) => p.id === id);
        const rebuilt = buildCaption(refreshed || post);
        caption.replaceWith(rebuilt);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn-inline';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', async () => {
        await deletePost(id);
    });

    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
    controls.appendChild(deleteBtn);
    caption.appendChild(controls);
}

async function savePost(id, patch) {
    if (!patch.author || !patch.artist || !patch.title) {
        alert('글쓴이, 작가, 제목은 비울 수 없습니다.');
        return;
    }
    if (patch.source_url && !/^https?:\/\//i.test(patch.source_url)) {
        alert('자료 출처 URL은 http(s):// 로 시작해야 합니다.');
        return;
    }

    const update = {
        author: patch.author,
        artist: patch.artist,
        title: patch.title,
        year: patch.year || null,
        description: patch.description || null,
        source_url: patch.source_url || null,
    };

    const { error } = await supabaseClient.from('posts').update(update).eq('id', id);
    if (error) {
        console.error(error);
        alert('수정 중 오류가 발생했습니다.');
        return;
    }

    await refreshAuthorsAndUI();
    await fetchPosts(document.getElementById('authorFilter').value || 'all');
}

function extractPathFromPublicUrl(url) {
    // public URL 포맷이 바뀌어도 최대한 안전하게 파싱
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/');
        const idx = parts.findIndex((p) => p === 'images');
        // .../storage/v1/object/public/images/<path>
        if (idx >= 0 && parts[idx + 1]) {
            return parts.slice(idx + 1).join('/');
        }
        return parts[parts.length - 1] || null;
    } catch {
        return url.split('/').pop() || null;
    }
}

async function deletePost(id) {
    const post = postsCache.find((p) => p.id === id);
    if (!post) return;

    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
        // DB 먼저 삭제
        const { error: deleteError } = await supabaseClient.from('posts').delete().eq('id', id);
        if (deleteError) throw deleteError;

        // 이미지 파일 삭제 (가능하면 image_path 사용, 없으면 URL에서 파싱)
        const path = post.image_path || (post.image_url ? extractPathFromPublicUrl(post.image_url) : null);
        if (path) {
            const { error: storageError } = await supabaseClient.storage.from('images').remove([path]);
            if (storageError) {
                // 파일 삭제 실패는 치명적이지 않게 처리
                console.warn('storage remove failed:', storageError);
            }
        }

        await refreshAuthorsAndUI();
        await fetchPosts(document.getElementById('authorFilter').value || 'all');
    } catch (e) {
        console.error(e);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('imageModal');
    const closeGlobal = document.getElementById('modalCloseGlobal');

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target === closeGlobal) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeModal();
        }
    });

    // initial load
    fetchPosts('all');
});