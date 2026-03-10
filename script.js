// ...existing inline <script> code from index.html moved here...

// 1. Supabase 초기화
const SUPABASE_URL = 'https://eqxdedztebcbgbblxody.supabase.co'; // 기존 값으로 교체
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxeGRlZHp0ZWJjYmdiYmx4b2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjQ1MDksImV4cCI6MjA4ODQ0MDUwOX0.WpSF-sResnQKk2dEmIL4q9WS90gWEBTjdQpENmyOOjo'; // 기존 값으로 교체
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. 전역 변수
let selectedFile = null;

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

    if (!author || !artist || !title) {
        alert('글쓴이, 작가, 제목은 필수입니다.');
        return;
    }

    let imageUrl = null;

    try {
        if (selectedFile) {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `images/${fileName}`;

            const { data: storageData, error: storageError } = await supabaseClient.storage
                .from('images') // 기존 버킷명으로 교체
                .upload(filePath, selectedFile);

            if (storageError) throw storageError;

            const { data: publicUrlData } = supabaseClient.storage
                .from('images')
                .getPublicUrl(filePath);

            imageUrl = publicUrlData.publicUrl;
        }

        const { error: insertError } = await supabaseClient
            .from('posts') // 기존 테이블명으로 교체
            .insert([
                {
                    author,
                    artist,
                    title,
                    year,
                    description: desc,
                    image_url: imageUrl,
                },
            ]);

        if (insertError) throw insertError;

        document.getElementById('authorInput').value = '';
        document.getElementById('artistInput').value = '';
        document.getElementById('titleInput').value = '';
        document.getElementById('yearInput').value = '';
        document.getElementById('descInput').value = '';
        cancelPreview();

        await fetchPosts(document.getElementById('authorFilter').value || 'all');
    } catch (error) {
        console.error(error);
        alert('업로드 중 오류가 발생했습니다.');
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

window.fetchPosts = async function (filterAuthor = 'all') {
    const posts = await fetchPostsInternal(filterAuthor);
    const feed = document.getElementById('feed');
    const authorFilter = document.getElementById('authorFilter');
    const authorTags = document.getElementById('authorTags');

    feed.innerHTML = '';
    authorFilter.innerHTML = '<option value="all">전체 보기</option>';
    authorTags.innerHTML = '';

    const authors = new Set();

    posts.forEach((post) => {
        authors.add(post.author);

        const card = document.createElement('div');
        card.className = 'post-card';

        const info = document.createElement('div');
        info.className = 'post-info';
        info.innerHTML = `
            <div class="post-meta">
                <span class="meta-item"><strong>글쓴이:</strong> ${post.author}</span>
                <span class="meta-item"><strong>작가:</strong> ${post.artist}</span>
                <span class="meta-item"><strong>제목:</strong> ${post.title}</span>
                ${post.year ? `<span class="meta-item"><strong>제작년도:</strong> ${post.year}</span>` : ''}
            </div>
            ${post.description ? `<p class="post-desc">${post.description}</p>` : ''}
        `;

        card.appendChild(info);

        if (post.image_url) {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'post-image-wrapper';

            const img = document.createElement('img');
            img.className = 'post-image';
            img.src = post.image_url;
            img.alt = post.title || '';
            img.loading = 'lazy';

            img.addEventListener('click', () => openModal(post.image_url, post.title));

            imgWrapper.appendChild(img);
            card.appendChild(imgWrapper);
        }

        feed.appendChild(card);
    });

    authors.forEach((author) => {
        const option = document.createElement('option');
        option.value = author;
        option.textContent = author;
        authorFilter.appendChild(option);

        const tag = document.createElement('button');
        tag.className = 'author-tag';
        tag.textContent = author;
        tag.addEventListener('click', () => {
            authorFilter.value = author;
            fetchPosts(author);
        });
        authorTags.appendChild(tag);
    });
}

// 7. 모달 관련
function openModal(imageUrl, caption) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');

    modalImage.src = imageUrl;
    modalCaption.textContent = caption || '';

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');

    modalImage.src = '';
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
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

    fetchPosts('all');
});