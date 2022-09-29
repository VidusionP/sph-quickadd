import $ from 'jquery';
import 'foundation-sites/js/foundation/foundation';
import 'foundation-sites/js/foundation/foundation.dropdown';
import utils from '@bigcommerce/stencil-utils';
import ProductDetails from '../common/product-details';
import { defaultModal } from './modal';
import 'slick-carousel';

export default function (context) {
    const modal = defaultModal();

    $('body').on('click', '.quickview', (event) => {
        event.preventDefault();

        const productId = $(event.currentTarget).data('product-id');
        const parentPos = $(`#${productId}`)[0]
        
        const modal1 = $('.modal-dropdown')
        const bodyRect = document.body.getBoundingClientRect()
        const quickaddPos = event.target.getBoundingClientRect()
        const offset1 = parentPos.getBoundingClientRect().left - bodyRect.left
        const offset2 = quickaddPos.top - bodyRect.top + 50 
        const offset4 = document.getElementsByClassName("product");
        const offset5 = ($(offset4[0]).width());
        // const offset3 = ((offset1+(offset5/2))/$(window).width())*100 >= 87 ? 87 : ((offset1+(offset5/2))/$(window).width())*100;
        const offset3 = ((offset1+(offset5/2))/$(window).width())*100 <= 13 ? 13 : ((offset1+(offset5/2))/$(window).width())*100 >= 87 ? 87 :((offset1+(offset5/2))/$(window).width())*100 ;
        // console.log(offset2);
        // console.log(offset3);
        // console.log(offset3);
        ($(".modal-dropdown").css("width",offset5+"px"));
       window.addEventListener('resize', function(event) {
            ($(".modal-dropdown").css("display","none"));
        }, true);
        modal.open({ size: 'large', pos: offset2, pos1: offset3, modal1: modal1, offset5: offset5 });

        utils.api.product.getById(productId, { template: 'products/quick-view' }, (err, response) => {
            modal.updateContent(response);

            modal.$content.find('.productView').addClass('productView--quickView');

            modal.$content.find('[data-slick]').slick();

            return new ProductDetails(modal.$content.find('.quickView'), context);
        });
    });
}
