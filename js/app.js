// 初始化LeanCloud
document.addEventListener('DOMContentLoaded', function() {
  try {
    AV.init({
      appId: CONFIG.appId,
      appKey: CONFIG.appKey,
      serverURL: CONFIG.serverURL
    });
    console.log('LeanCloud初始化成功');
    
    // 检查是否已登录
    checkLoginStatus();
  } catch (error) {
    console.error('LeanCloud初始化失败:', error);
    alert('系统初始化失败，请刷新页面重试');
  }
});

// 全局变量
let currentPage = 1;
let pageSize = 10;
let totalPages = 1;
let currentFeedback = null;
let feedbackModal = null;

// 检查登录状态
function checkLoginStatus() {
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  
  if (adminInfo.isLoggedIn) {
    // 已登录，显示主页面
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('mainPage').classList.remove('d-none');
    document.getElementById('adminName').textContent = adminInfo.username || '管理员';
    
    // 初始化模态框
    feedbackModal = new bootstrap.Modal(document.getElementById('feedbackModal'));
    
    // 设置默认日期范围（最近30天）
    setDefaultDateRange();
    
    // 加载反馈数据
    loadFeedbackData();
  }
}

// 设置默认日期范围
function setDefaultDateRange() {
  const today = new Date();
  const endDate = formatDate(today);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  document.getElementById('startDate').value = formatDate(startDate);
  document.getElementById('endDate').value = endDate;
}

// 格式化日期为YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 格式化日期时间
function formatDateTime(dateObj) {
  const date = new Date(dateObj);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 登录函数
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
    alert('请输入用户名和密码');
    return;
  }
  
  try {
    // 查询管理员表
    const query = new AV.Query('admins');
    query.equalTo('username', username);
    const admin = await query.first();
    
    if (!admin || admin.get('password') !== password) {
      alert('用户名或密码错误');
      return;
    }
    
    // 保存登录状态
    localStorage.setItem('adminInfo', JSON.stringify({
      username: admin.get('username'),
      isLoggedIn: true
    }));
    
    // 显示主页面
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('mainPage').classList.remove('d-none');
    document.getElementById('adminName').textContent = admin.get('username');
    
    // 初始化模态框
    feedbackModal = new bootstrap.Modal(document.getElementById('feedbackModal'));
    
    // 设置默认日期范围
    setDefaultDateRange();
    
    // 加载反馈数据
    loadFeedbackData();
    
  } catch (error) {
    console.error('登录失败:', error);
    alert('登录失败，请稍后重试');
  }
}

// 退出登录
function logout() {
  localStorage.removeItem('adminInfo');
  location.reload();
}

// 加载反馈数据
async function loadFeedbackData() {
  try {
    // 构建查询条件
    const query = buildQuery();
    
    // 获取总数
    const count = await query.count();
    totalPages = Math.ceil(count / pageSize);
    
    // 查询当前页数据
    query.skip((currentPage - 1) * pageSize);
    query.limit(pageSize);
    query.descending('submitTime');
    
    const feedbacks = await query.find();
    
    // 渲染数据
    renderFeedbackList(feedbacks);
    renderPagination();
    
  } catch (error) {
    console.error('加载数据失败:', error);
    alert('加载数据失败，请刷新页面重试');
  }
}

// 构建查询条件
function buildQuery() {
  const query = new AV.Query('feedback');
  
  // 日期筛选
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  
  if (startDate) {
    const startDateTime = new Date(startDate);
    startDateTime.setHours(0, 0, 0, 0);
    query.greaterThanOrEqualTo('submitTime', startDateTime);
  }
  
  if (endDate) {
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);
    query.lessThanOrEqualTo('submitTime', endDateTime);
  }
  
  // 评分筛选
  const rating = document.getElementById('ratingFilter').value;
  if (rating) {
    query.equalTo('rating', parseInt(rating));
  }
  
  // 状态筛选
  const status = document.getElementById('statusFilter').value;
  if (status) {
    query.equalTo('status', status);
  }
  
  return query;
}

// 渲染反馈列表
function renderFeedbackList(feedbacks) {
  const tbody = document.getElementById('feedbackList');
  tbody.innerHTML = '';
  
  if (feedbacks.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="text-center py-3">暂无数据</td>';
    tbody.appendChild(tr);
    return;
  }
  
  feedbacks.forEach(feedback => {
    const tr = document.createElement('tr');
    
    // 获取评分文本
    let ratingText = '';
    switch(feedback.get('rating')) {
      case 1: ratingText = '非常不满意'; break;
      case 2: ratingText = '不满意'; break;
      case 3: ratingText = '一般'; break;
      case 4: ratingText = '满意'; break;
      case 5: ratingText = '非常满意'; break;
    }
    
    // 获取状态文本
    let statusText = '';
    switch(feedback.get('status') || 'pending') {
      case 'pending': statusText = '待处理'; break;
      case 'processing': statusText = '处理中'; break;
      case 'completed': statusText = '已完成'; break;
    }
    
    // 格式化提交时间
    const submitTime = formatDateTime(feedback.get('submitTime'));
    
    tr.innerHTML = `
      <td>${submitTime}</td>
      <td>
        <span class="rating-tag rating-${feedback.get('rating')}">
          ${feedback.get('rating')}星 (${ratingText})
        </span>
      </td>
      <td>${feedback.get('employeeInfo') || '-'}</td>
      <td class="truncate">${feedback.get('feedbackContent') || '无详细反馈'}</td>
      <td>
        <span class="status-tag status-${feedback.get('status') || 'pending'}">
          ${statusText}
        </span>
      </td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewFeedback('${feedback.id}')">查看</button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

// 渲染分页
function renderPagination() {
  const pagination = document.getElementById('pagination');
  pagination.innerHTML = '';
  
  if (totalPages <= 1) {
    return;
  }
  
  // 上一页按钮
  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `
    <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">上一页</a>
  `;
  pagination.appendChild(prevLi);
  
  // 页码按钮
  const maxPages = 5; // 最多显示的页码数
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  
  if (endPage - startPage + 1 < maxPages) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const li = document.createElement('li');
    li.className = `page-item ${i === currentPage ? 'active' : ''}`;
    li.innerHTML = `
      <a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>
    `;
    pagination.appendChild(li);
  }
  
  // 下一页按钮
  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
  nextLi.innerHTML = `
    <a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">下一页</a>
  `;
  pagination.appendChild(nextLi);
}

// 跳转到指定页
function goToPage(page) {
  if (page < 1 || page > totalPages) {
    return;
  }
  
  currentPage = page;
  loadFeedbackData();
}

// 应用筛选
function applyFilter() {
  currentPage = 1;
  loadFeedbackData();
}

// 重置筛选
function resetFilter() {
  document.getElementById('ratingFilter').value = '';
  document.getElementById('statusFilter').value = '';
  setDefaultDateRange();
  currentPage = 1;
  loadFeedbackData();
}

// 查看反馈详情
async function viewFeedback(id) {
  try {
    const query = new AV.Query('feedback');
    const feedback = await query.get(id);
    
    currentFeedback = feedback;
    
    // 填充模态框数据
    document.getElementById('modal-time').textContent = formatDateTime(feedback.get('submitTime'));
    
    // 评分和文本
    let ratingText = '';
    switch(feedback.get('rating')) {
      case 1: ratingText = '非常不满意'; break;
      case 2: ratingText = '不满意'; break;
      case 3: ratingText = '一般'; break;
      case 4: ratingText = '满意'; break;
      case 5: ratingText = '非常满意'; break;
    }
    document.getElementById('modal-rating').textContent = `${feedback.get('rating')}星 (${ratingText})`;
    
    document.getElementById('modal-employee').textContent = feedback.get('employeeInfo') || '-';
    document.getElementById('modal-name').textContent = feedback.get('passengerName') || '未提供';
    document.getElementById('modal-phone').textContent = feedback.get('passengerPhone') || '未提供';
    
    // 回电需求
    const isNeedCallback = feedback.get('isNeedCallback') || false;
    document.getElementById('modal-callback').textContent = isNeedCallback ? '需要回电' : '不需要回电';
    
    // 回电状态容器显示/隐藏
    const callbackContainer = document.getElementById('callback-status-container');
    callbackContainer.style.display = isNeedCallback ? 'block' : 'none';
    
    // 分享状态容器显示/隐藏
    const isAgreeShare = feedback.get('isAgreeShare') || false;
    const shareContainer = document.getElementById('share-status-container');
    shareContainer.style.display = isAgreeShare ? 'block' : 'none';
    
    document.getElementById('modal-content').textContent = feedback.get('feedbackContent') || '无详细反馈';
    
    // 设置当前状态
    document.getElementById('modal-status').value = feedback.get('status') || 'pending';
    
    if (isNeedCallback) {
      document.getElementById('modal-callback-status').value = feedback.get('callbackStatus') || 'pending';
    }
    
    if (isAgreeShare) {
      document.getElementById('modal-share-status').value = feedback.get('shareStatus') || 'pending';
    }
    
    // 处理备注
    document.getElementById('modal-note').value = feedback.get('note') || '';
    
    // 显示模态框
    feedbackModal.show();
    
  } catch (error) {
    console.error('获取反馈详情失败:', error);
    alert('获取反馈详情失败，请稍后重试');
  }
}

// 复制反馈内容
function copyFeedbackContent() {
  const content = document.getElementById('modal-content').textContent;
  navigator.clipboard.writeText(content)
    .then(() => {
      alert('已复制到剪贴板');
    })
    .catch(err => {
      console.error('复制失败:', err);
      alert('复制失败，请手动选择复制');
    });
}

// 保存反馈状态
async function saveFeedback() {
  if (!currentFeedback) {
    return;
  }
  
  try {
    // 获取表单值
    const status = document.getElementById('modal-status').value;
    const note = document.getElementById('modal-note').value;
    
    // 更新对象
    currentFeedback.set('status', status);
    currentFeedback.set('note', note);
    
    // 回电状态
    if (currentFeedback.get('isNeedCallback')) {
      const callbackStatus = document.getElementById('modal-callback-status').value;
      currentFeedback.set('callbackStatus', callbackStatus);
    }
    
    // 分享状态
    if (currentFeedback.get('isAgreeShare')) {
      const shareStatus = document.getElementById('modal-share-status').value;
      currentFeedback.set('shareStatus', shareStatus);
    }
    
    // 保存
    await currentFeedback.save();
    
    alert('保存成功');
    feedbackModal.hide();
    
    // 重新加载数据
    loadFeedbackData();
    
  } catch (error) {
    console.error('保存失败:', error);
    alert('保存失败，请稍后重试');
  }
}

// 导出数据为Excel
async function exportData() {
  try {
    // 构建查询条件
    const query = buildQuery();
    query.limit(1000); // 最多导出1000条
    query.descending('submitTime');
    
    const feedbacks = await query.find();
    
    if (feedbacks.length === 0) {
      alert('没有数据可导出');
      return;
    }
    
    // 准备导出数据
    const exportData = feedbacks.map(feedback => {
      // 获取评分文本
      let ratingText = '';
      switch(feedback.get('rating')) {
        case 1: ratingText = '非常不满意'; break;
        case 2: ratingText = '不满意'; break;
        case 3: ratingText = '一般'; break;
        case 4: ratingText = '满意'; break;
        case 5: ratingText = '非常满意'; break;
      }
      
      // 获取状态文本
      let statusText = '';
      switch(feedback.get('status') || 'pending') {
        case 'pending': statusText = '待处理'; break;
        case 'processing': statusText = '处理中'; break;
        case 'completed': statusText = '已完成'; break;
      }
      
      return {
        '提交时间': formatDateTime(feedback.get('submitTime')),
        '评分': `${feedback.get('rating')}星(${ratingText})`,
        '服务人员': feedback.get('employeeInfo') || '-',
        '乘客姓名': feedback.get('passengerName') || '-',
        '联系电话': feedback.get('passengerPhone') || '-',
        '反馈内容': feedback.get('feedbackContent') || '-',
        '处理状态': statusText,
        '备注': feedback.get('note') || '-'
      };
    });
    
    // 创建工作表
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '反馈数据');
    
    // 生成文件名
    const now = new Date();
    const fileName = `反馈数据_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
    
    // 导出文件
    XLSX.writeFile(workbook, fileName);
    
  } catch (error) {
    console.error('导出失败:', error);
    alert('导出失败，请稍后重试');
  }
}
